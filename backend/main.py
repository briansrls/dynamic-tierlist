from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordBearer
from fastapi.middleware.cors import CORSMiddleware # Import CORS middleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from datetime import datetime, timezone
from fastapi import Path

from core.config import settings
import httpx
import urllib.parse
from jose import JWTError, jwt
from datetime import timedelta # For token expiry

app = FastAPI()

# --- CORS Middleware --- 
# This should be among the first middleware added if you have multiple.
origins = [
    "http://localhost:3000", # Your frontend origin
    # Add other origins if needed, e.g., your production frontend URL
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True, # Allows cookies to be included in requests (if you use them later)
    allow_methods=["*"],    # Allows all methods (GET, POST, PUT, etc.)
    allow_headers=["*"],    # Allows all headers
)

# --- Pydantic Models ---

class ScoreEntry(BaseModel):
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    score_value: float  # Absolute score at this timestamp
    reason: Optional[str] = None

class UserSocialCreditTarget(BaseModel):
    target_user_id: str
    scores_history: List[ScoreEntry] = []

# Simplified server info to be stored with the user or fetched
class UserServerInfo(BaseModel):
    id: str # Discord Server ID
    name: str
    icon: Optional[str] = None # Icon hash
    # owner: bool - can get this from Discord API if needed
    # permissions: str - can get this from Discord API if needed

class User(BaseModel):
    user_id: str
    username: str
    profile_picture_url: Optional[str] = None
    social_credits_given: List[UserSocialCreditTarget] = []
    servers: List[UserServerInfo] = [] # Add a list to store user's servers

class Server(BaseModel):
    server_id: str
    server_name: str
    user_ids: List[str] = []

class SocialCreditUpdateRequest(BaseModel):
    score_delta: float
    reason: Optional[str] = None

class DiscordMemberSearchResult(BaseModel):
    id: str
    username: str
    discriminator: str # e.g., "0001" or the new username system without it
    avatar_url: Optional[str] = None
    # Add other fields like nickname if needed

class DiscordUserProfile(BaseModel):
    id: str
    username: str
    discriminator: str
    avatar: Optional[str] = None # This is the avatar hash
    avatar_url: Optional[str] = None # We will construct this
    banner: Optional[str] = None # Banner hash
    accent_color: Optional[int] = None
    public_flags: Optional[int] = None

class GuildMemberStatus(BaseModel):
    server_id: str
    user_id: str
    is_member: bool
    username_in_server: Optional[str] = None # Could be nickname or global name
    # We could also include the full member object if needed later

# --- In-Memory Database ---
# For now, we'll use dictionaries to simulate MongoDB collections.
# In a real application, these would be replaced with MongoDB operations.

db_users: Dict[str, User] = {}  # Keyed by user_id
db_servers: Dict[str, Server] = {} # Keyed by server_id

# --- Sample Data ---
def initialize_sample_data():
    # Clear existing data
    db_users.clear()
    db_servers.clear()

    # Sample Users
    user1 = User(user_id="u1", username="Alice", profile_picture_url="https://example.com/alice.png")
    user2 = User(user_id="u2", username="Bob", profile_picture_url="https://example.com/bob.png")
    user3 = User(user_id="u3", username="Charlie", profile_picture_url="https://example.com/charlie.png")
    user4 = User(user_id="u4", username="Diana") # User in another server or no server yet

    db_users[user1.user_id] = user1
    db_users[user2.user_id] = user2
    db_users[user3.user_id] = user3
    db_users[user4.user_id] = user4

    # Sample Servers
    server1 = Server(server_id="s1", server_name="Gaming Crew", user_ids=["u1", "u2"])
    server2 = Server(server_id="s2", server_name="Study Group", user_ids=["u1", "u3"])
    
    db_servers[server1.server_id] = server1
    db_servers[server2.server_id] = server2

    # Sample Social Credit Data: Alice gives Bob a score
    alice_gives_bob_credit = UserSocialCreditTarget(target_user_id="u2")
    alice_gives_bob_credit.scores_history.append(
        ScoreEntry(score_value=10, reason="Initial good impression")
    )
    alice_gives_bob_credit.scores_history.append(
        ScoreEntry(score_value=15, reason="Helped with a quest")
    )
    user1.social_credits_given.append(alice_gives_bob_credit)
    
    # Alice gives Charlie a score
    alice_gives_charlie_credit = UserSocialCreditTarget(target_user_id="u3")
    alice_gives_charlie_credit.scores_history.append(
        ScoreEntry(score_value=5, reason="Joined late to study session")
    )
    user1.social_credits_given.append(alice_gives_charlie_credit)

    # Bob gives Alice a score
    bob_gives_alice_credit = UserSocialCreditTarget(target_user_id="u1")
    bob_gives_alice_credit.scores_history.append(
        ScoreEntry(score_value=8, reason="Friendly")
    )
    user2.social_credits_given.append(bob_gives_alice_credit)

initialize_sample_data() # Initialize with sample data when the app starts

# --- API Endpoints ---

@app.get("/")
async def read_root():
    return {"message": "Hello from the Social Credit Backend"}

# --- OAuth Endpoints ---

@app.get("/auth/discord/login")
async def auth_discord_login():
    """
    Redirects the user to Discord's OAuth2 authorization page.
    """
    scopes = ["identify", "email", "guilds"] # Common scopes
    params = {
        "client_id": settings.DISCORD_CLIENT_ID,
        "redirect_uri": settings.DISCORD_REDIRECT_URI,
        "response_type": "code",
        "scope": ' '.join(scopes),
        # "state": "your_random_state_string"  # Optional: for CSRF protection, recommended for production
    }
    discord_auth_url_with_params = f"{settings.DISCORD_AUTH_URL}?{urllib.parse.urlencode(params)}"
    return RedirectResponse(url=discord_auth_url_with_params)

# OAuth2 scheme for Bearer token dependency
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token") # tokenUrl is not used directly by us here, but required

# Helper function to create JWT access token
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt

@app.get("/auth/discord/callback")
async def auth_discord_callback(code: str, state: Optional[str] = None):
    """
    Handles the callback from Discord after user authorization.
    Exchanges the authorization code for an access token and fetches user info.
    """
    token_data = {
        "client_id": settings.DISCORD_CLIENT_ID,
        "client_secret": settings.DISCORD_CLIENT_SECRET,
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": settings.DISCORD_REDIRECT_URI,
        # "scope": "identify email guilds" # Not strictly needed for token exchange but good to remember
    }

    headers = {
        'Content-Type': 'application/x-www-form-urlencoded'
    }

    async with httpx.AsyncClient() as client:
        try:
            # 1. Exchange code for access token
            token_response = await client.post(settings.DISCORD_TOKEN_URL, data=token_data, headers=headers)
            token_response.raise_for_status()  # Raise an exception for bad status codes (4xx or 5xx)
            token_payload = token_response.json()
            access_token = token_payload.get("access_token")
            # refresh_token = token_payload.get("refresh_token") # Store this securely if needed for long-lived access
            # expires_in = token_payload.get("expires_in")

            if not access_token:
                raise HTTPException(status_code=400, detail="Could not obtain access token from Discord")

            # 2. Fetch user information from Discord using the access token
            user_info_headers = {
                "Authorization": f"Bearer {access_token}"
            }
            user_info_response = await client.get(settings.DISCORD_USER_INFO_URL, headers=user_info_headers)
            user_info_response.raise_for_status()
            user_info = user_info_response.json()

            # 3. Fetch user's guilds (servers)
            user_guilds_response = await client.get(settings.DISCORD_USER_GUILDS_URL, headers=user_info_headers)
            user_guilds_response.raise_for_status()
            guilds_info = user_guilds_response.json()
            
            user_servers_list: List[UserServerInfo] = []
            for guild in guilds_info:
                user_servers_list.append(UserServerInfo(
                    id=guild["id"],
                    name=guild["name"],
                    icon=guild.get("icon")
                ))

            discord_id = user_info.get("id")
            discord_username = user_info.get("username")
            discord_avatar = user_info.get("avatar")
            discord_email = user_info.get("email") # If email scope was granted and present

            if not discord_id or not discord_username:
                raise HTTPException(status_code=500, detail="Could not retrieve essential user info from Discord.")

            # Upsert user in our mock database
            profile_pic_url = f"https://cdn.discordapp.com/avatars/{discord_id}/{discord_avatar}.png" if discord_avatar else None
            
            if discord_id not in db_users:
                app_user = User(
                    user_id=discord_id, 
                    username=discord_username, # Store base username
                    profile_picture_url=profile_pic_url,
                    social_credits_given=[],
                    servers=user_servers_list
                )
                db_users[discord_id] = app_user
                print(f"Added new user {discord_username} (ID: {discord_id}) to db_users from OAuth callback.")
            else:
                db_users[discord_id].username = discord_username # Update base username
                db_users[discord_id].profile_picture_url = profile_pic_url
                db_users[discord_id].servers = user_servers_list # Update servers list from OAuth
                print(f"Updated user {discord_username} (ID: {discord_id}) in db_users from OAuth callback.")
            
            # Create JWT for our application session
            access_token_expires = timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
            app_access_token = create_access_token(
                data={"sub": discord_id, "username": discord_username}, 
                expires_delta=access_token_expires
            )
            
            # Redirect to frontend with the token
            frontend_redirect_url = f"http://localhost:3000/auth/callback?token={app_access_token}"
            # In a production app, you might get the frontend URL from settings as well.
            return RedirectResponse(url=frontend_redirect_url)

        except httpx.HTTPStatusError as e:
            # Log the error details from Discord if possible
            error_detail = e.response.json() if e.response else str(e)
            print(f"Discord API Error: {error_detail}") # Log to server console
            raise HTTPException(status_code=e.response.status_code, detail=f"Error communicating with Discord: {error_detail}")
        except Exception as e:
            print(f"Generic error in Discord callback: {e}") # Log to server console
            raise HTTPException(status_code=500, detail=f"An unexpected error occurred during Discord authentication: {str(e)}")

# Helper function to get current user from token
async def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        user_id: str = payload.get("sub")
        username: str = payload.get("username") # We can also get username if stored
        if user_id is None or username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = db_users.get(user_id)
    if user is None:
        # This case should ideally not happen if JWTs are issued only for existing users
        # Or, it could mean the user was deleted after the token was issued.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user

# --- User Endpoints ---
@app.get("/users/me", response_model=User)
async def read_users_me(current_user: User = Depends(get_current_user)):
    """
    Get the details of the currently authenticated user.
    """
    return current_user

@app.get("/users/me/tracked-servers", response_model=List[UserServerInfo])
async def read_user_tracked_servers(current_user: User = Depends(get_current_user)):
    """
    Get the list of servers the authenticated user has (initially fetched from Discord).
    In the future, this could be a list of servers the user explicitly tracks in this app.
    """
    # For now, it returns all servers associated with the user from the initial fetch.
    # Later, you might have a separate 'tracked_servers' list if users pick from their Discord servers.
    return current_user.servers

@app.post("/users/{acting_user_id}/credit/{target_user_id}", response_model=UserSocialCreditTarget)
async def give_social_credit(
    acting_user_id: str,  # Path parameter, taken from URL
    target_user_id: str,  # Path parameter, taken from URL
    update_request: SocialCreditUpdateRequest, # Request body
    current_user: User = Depends(get_current_user) # Authenticated user
):
    # Validate that the path acting_user_id matches the authenticated user
    if acting_user_id != current_user.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Path acting_user_id does not match authenticated user."
        )
    
    # Now, acting_user is the authenticated current_user object, already fetched from db_users
    acting_user = current_user 
    # No need to check if acting_user.user_id is in db_users, get_current_user already did that.
    
    if target_user_id not in db_users:
        raise HTTPException(status_code=404, detail=f"Target user {target_user_id} not found")
    
    if acting_user.user_id == target_user_id:
        raise HTTPException(status_code=400, detail="Users cannot give credit to themselves")

    # Find if this acting_user already has a credit entry for target_user_id
    credit_target_entry = None
    for entry in acting_user.social_credits_given:
        if entry.target_user_id == target_user_id:
            credit_target_entry = entry
            break
    
    if not credit_target_entry:
        credit_target_entry = UserSocialCreditTarget(target_user_id=target_user_id)
        acting_user.social_credits_given.append(credit_target_entry)

    # Determine the current score
    current_score = 0.0
    if credit_target_entry.scores_history:
        current_score = credit_target_entry.scores_history[-1].score_value
    
    new_score = current_score + update_request.score_delta

    new_score_entry = ScoreEntry(
        score_value=new_score,
        reason=update_request.reason
    )
    credit_target_entry.scores_history.append(new_score_entry)
    
    return credit_target_entry

@app.get("/servers", response_model=List[Server])
async def get_servers():
    return list(db_servers.values())

@app.get("/servers/{server_id}/users", response_model=List[User])
async def get_server_users(server_id: str):
    if server_id not in db_servers:
        raise HTTPException(status_code=404, detail=f"Server {server_id} not found")
    
    server = db_servers[server_id]
    user_objects = []
    for user_id in server.user_ids:
        if user_id in db_users:
            user_objects.append(db_users[user_id])
        else:
            # This case should ideally not happen if data is consistent
            print(f"Warning: User ID {user_id} found in server {server_id} but not in db_users.")
    return user_objects

@app.get("/users/{user_id}/credit/given", response_model=List[UserSocialCreditTarget])
async def get_social_credit_given_by_user(user_id: str):
    if user_id not in db_users:
        raise HTTPException(status_code=404, detail=f"User {user_id} not found")
    return db_users[user_id].social_credits_given

@app.get("/users/{user_id}/credit/given/{target_user_id}", response_model=UserSocialCreditTarget)
async def get_social_credit_given_to_target(user_id: str, target_user_id: str):
    if user_id not in db_users:
        raise HTTPException(status_code=404, detail=f"User {user_id} not found")
    
    acting_user = db_users[user_id]
    for entry in acting_user.social_credits_given:
        if entry.target_user_id == target_user_id:
            return entry
    raise HTTPException(status_code=404, detail=f"No credit history found from user {user_id} to {target_user_id}")

# --- Discord Integration Endpoints (Simulated) ---

@app.get("/discord/servers/{server_id}/members/search", response_model=List[DiscordMemberSearchResult])
async def search_discord_server_members(
    server_id: str,
    query: str,
    current_user: User = Depends(get_current_user) # Ensure user is authenticated
):
    """
    Simulates searching for members in a Discord server.
    In a real application, this would call the Discord API.
    """
    print(f"User {current_user.user_id} searching in server {server_id} for query: '{query}'")

    # Check if the server exists in our mock DB (optional, but good practice)
    if server_id not in db_servers:
        raise HTTPException(status_code=404, detail=f"Server {server_id} not found in mock database.")

    # Mock data - simulate finding users in that server
    # In a real scenario, you'd fetch all members of db_servers[server_id]
    # and then filter them by the query.
    
    # For simplicity, let's assume we have a few global mock users we can filter
    # These users might or might not be in the db_users or the specific server's user_ids list for this simulation.
    # This is a very simplified mock.
    mock_discord_users = [
        DiscordMemberSearchResult(id="discord_user_1", username="SearchUserAlice", discriminator="1111", avatar_url="https://cdn.discordapp.com/embed/avatars/0.png"),
        DiscordMemberSearchResult(id="discord_user_2", username="SearchUserBob", discriminator="2222", avatar_url="https://cdn.discordapp.com/embed/avatars/1.png"),
        DiscordMemberSearchResult(id="discord_user_3", username="TestUserCharlie", discriminator="3333", avatar_url="https://cdn.discordapp.com/embed/avatars/2.png"),
        DiscordMemberSearchResult(id="discord_user_4", username="AnotherBob", discriminator="4444", avatar_url=None),
    ]

    results = [
        member for member in mock_discord_users 
        if query.lower() in member.username.lower()
    ]
    
    # Further refinement: Check if these users are part of the server_id based on db_servers and db_users
    # For now, we just return any match from the global mock list.
    # A more realistic mock would involve:
    # 1. Getting user_ids from db_servers[server_id].user_ids
    # 2. For each user_id, getting the User object from db_users.
    # 3. Checking if the query matches their username.
    # 4. Formatting them into DiscordMemberSearchResult.
    # This is complex for a quick mock, so the current approach is a placeholder.

    return results

@app.get("/discord/users/{user_id_to_lookup}", response_model=DiscordUserProfile)
async def get_discord_user_profile(
    user_id_to_lookup: str,
    current_user: User = Depends(get_current_user) # To ensure the endpoint is used by authenticated app users
):
    """
    Fetches a Discord user's public profile by their ID using the application's bot token,
    and upserts them into the local db_users.
    """
    if not settings.DISCORD_BOT_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Application bot token is not configured on the server."
        )

    discord_api_url = f"https://discord.com/api/v10/users/{user_id_to_lookup}"
    headers = {
        "Authorization": f"Bot {settings.DISCORD_BOT_TOKEN}"
    }

    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(discord_api_url, headers=headers)
            response.raise_for_status() # Raise an exception for bad status codes (4xx or 5xx)
            
            user_data = response.json()
            
            avatar_hash = user_data.get("avatar")
            user_id = user_data.get("id") # This is the ID of the user we looked up
            username = user_data.get("username")
            discriminator = user_data.get("discriminator") # Needed for constructing full username for display
            
            avatar_full_url = None
            if avatar_hash and user_id:
                extension = "gif" if avatar_hash.startswith("a_") else "png"
                avatar_full_url = f"https://cdn.discordapp.com/avatars/{user_id}/{avatar_hash}.{extension}?size=128"

            # Upsert this fetched user into our db_users
            if user_id and username: # Ensure we have the basic info
                if user_id not in db_users:
                    db_users[user_id] = User(
                        user_id=user_id,
                        username=username, # Store base username
                        profile_picture_url=avatar_full_url,
                        servers=[],
                        social_credits_given=[]
                    )
                    print(f"Added new user {username}#{discriminator} (ID: {user_id}) to db_users from direct lookup.")
                else:
                    # User exists, only update profile details from this specific lookup
                    db_users[user_id].username = username # Update base username
                    db_users[user_id].profile_picture_url = avatar_full_url
                    # DO NOT overwrite .servers or .social_credits_given here
                    print(f"Updated profile for user {username}#{discriminator} (ID: {user_id}) in db_users from direct lookup.")
            
            return DiscordUserProfile(
                id=user_id if user_id else "Unknown ID",
                username=username if username else "Unknown User",
                discriminator=discriminator if discriminator else "0000",
                avatar=avatar_hash,
                avatar_url=avatar_full_url,
                banner=user_data.get("banner"),
                accent_color=user_data.get("accent_color"),
                public_flags=user_data.get("public_flags")
            )

        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                raise HTTPException(status_code=404, detail=f"Discord user with ID '{user_id_to_lookup}' not found.")
            else:
                # Log the error details from Discord if possible
                error_detail = e.response.json() if e.response else str(e)
                print(f"Discord API Error fetching user {user_id_to_lookup}: {error_detail}") # Log to server console
                raise HTTPException(status_code=e.response.status_code, detail=f"Error communicating with Discord: {str(error_detail)}")
        except Exception as e:
            print(f"Generic error fetching user {user_id_to_lookup}: {e}") # Log to server console
            raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")

@app.get("/discord/servers/{server_id}/members/{user_id_to_check}/is-member", response_model=GuildMemberStatus)
async def check_guild_membership(
    server_id: str,
    user_id_to_check: str,
    current_user: User = Depends(get_current_user) # Authenticated app user
):
    """
    Checks if a given user ID is a member of a given server ID (guild ID).
    Uses the application's bot token for the Discord API call.
    """
    if not settings.DISCORD_BOT_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Application bot token is not configured on the server for this operation."
        )

    discord_api_url = f"https://discord.com/api/v10/guilds/{server_id}/members/{user_id_to_check}"
    headers = {
        "Authorization": f"Bot {settings.DISCORD_BOT_TOKEN}"
    }

    async with httpx.AsyncClient() as client:
        try:
            print(f"BACKEND: Calling Discord API: {discord_api_url} for user {user_id_to_check} in server {server_id}") # LOG 1
            response = await client.get(discord_api_url, headers=headers)
            print(f"BACKEND: Discord API response status: {response.status_code} for user {user_id_to_check} in server {server_id}") # LOG 2
            
            if response.status_code == 200:
                member_data = response.json()
                username = member_data.get("user", {}).get("username", "Unknown")
                nickname = member_data.get("nick")
                print(f"BACKEND: User {user_id_to_check} IS member of {server_id}. Nick: {nickname}, User: {username}. Returning is_member=True.") # LOG 3
                return GuildMemberStatus(
                    server_id=server_id,
                    user_id=user_id_to_check,
                    is_member=True,
                    username_in_server=nickname or username
                )
            elif response.status_code == 404: # User is not a member of the guild
                print(f"BACKEND: User {user_id_to_check} NOT member of {server_id} (Discord 404). Returning is_member=False.") # LOG 4
                return GuildMemberStatus(
                    server_id=server_id,
                    user_id=user_id_to_check,
                    is_member=False
                )
            else:
                error_text = "Unknown error structure"
                try:
                    error_text = response.text
                except Exception:
                    pass # Keep default error_text
                print(f"BACKEND: Discord API returned other status {response.status_code} for user {user_id_to_check}. Content: {error_text}") # LOG 5
                response.raise_for_status() 
                # This part below is typically unreachable if raise_for_status() works as expected for client errors
                return GuildMemberStatus(server_id=server_id, user_id=user_id_to_check, is_member=False, username_in_server="Discord API Error") 

        except httpx.HTTPStatusError as e:
            error_detail = "Unknown error structure"
            try:
                error_detail = e.response.text
            except Exception:
                pass # Keep default error_detail
            print(f"BACKEND: HTTPStatusError checking membership for user {user_id_to_check} in server {server_id}: Status {e.response.status_code}, Detail: {error_detail}. Returning is_member=False.") # LOG 6
            if e.response.status_code == 403:
                 return GuildMemberStatus(server_id=server_id, user_id=user_id_to_check, is_member=False, username_in_server="Access Denied")
            return GuildMemberStatus(server_id=server_id, user_id=user_id_to_check, is_member=False, username_in_server="Error Checking Status")
        except Exception as e:
            print(f"BACKEND: Generic error checking membership for user {user_id_to_check} in server {server_id}: {str(e)}. Returning is_member=False.") # LOG 7
            return GuildMemberStatus(server_id=server_id, user_id=user_id_to_check, is_member=False, username_in_server="Generic Error")

# MONGO_URI = "mongodb://localhost:27017/"
# client = MongoClient(MONGO_URI)
# db = client.social_credit_db

# Further endpoints for servers, users, scores will go here 