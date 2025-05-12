from fastapi import FastAPI, HTTPException, Depends, status, Security, Header
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordBearer
from fastapi.security.api_key import APIKeyHeader
from fastapi.middleware.cors import CORSMiddleware # Import CORS middleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from fastapi import Path
import secrets # For generating secure tokens

from backend.core.config import settings
import httpx
import urllib.parse
from jose import JWTError, jwt
from datetime import timedelta # For token expiry

import sys
print(f"--- sys.path BEFORE imports ---")
print(sys.path)
print(f"-------------------------------")

# Import database functions and models
from backend.core.database import (
    init_db,
    close_mongodb_connection,
    get_user as db_get_user,
    upsert_user as db_upsert_user,
    update_user_api_key as db_update_user_api_key,
    verify_user_api_key as db_verify_user_api_key,
    get_server as db_get_server,
    upsert_server as db_upsert_server,
    db # Import the db object itself
)

app = FastAPI()

# --- Database Startup/Shutdown Events ---
@app.on_event("startup")
async def startup_db_client():
    await init_db()

@app.on_event("shutdown")
async def shutdown_db_client():
    await close_mongodb_connection()

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
    server_id: Optional[str] = None   # Context from plugin
    channel_id: Optional[str] = None  # Context from plugin
    message_id: Optional[str] = None  # Context from plugin
    message_content_snippet: Optional[str] = None # Added: Snippet from plugin

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
    servers: List[UserServerInfo] = []
    plugin_api_key: Optional[str] = None # This is correct on the User model
    plugin_api_key_generated_at: Optional[datetime] = None # This is correct on the User model

class Server(BaseModel):
    server_id: str
    server_name: str
    user_ids: List[str] = []
    # reason: Optional[str] = None # REMOVE - Reason belongs to ScoreEntry
    # No score_delta needed, calculate based on history? No, pass delta from plugin. # REMOVE - Comment not relevant to Server model

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
    associatedServerIds: Optional[List[str]] = None  # Add this field to match frontend

class GuildMemberStatus(BaseModel):
    server_id: str
    user_id: str
    is_member: bool
    username_in_server: Optional[str] = None # Could be nickname or global name
    # We could also include the full member object if needed later

class PluginRatingCreate(BaseModel):
    acting_user_id: str # Discord ID of user using the plugin
    target_user_id: str # Discord ID of user whose message was rated
    server_id: str
    channel_id: str # NEW: ID of the channel where message occurred
    message_id: str
    score_delta: float
    message_content_snippet: str # Added: Snippet from plugin
    # No reason field as per request

# --- Response Models ---
class PluginApiKeyResponse(BaseModel):
    api_key: str
    generated_at: datetime

# --- In-Memory Database ---
# For now, we'll use dictionaries to simulate MongoDB collections.
# In a real application, these would be replaced with MongoDB operations.

# db_users: Dict[str, User] = {}  # Keyed by user_id
# db_servers: Dict[str, Server] = {} # Keyed by server_id

# --- Sample Data ---
# def initialize_sample_data(): - REMOVED
    # ... entire function removed ...

# initialize_sample_data() # Initialize with sample data when the app starts - REMOVED

# --- API Key Authentication for Plugin (Modified for Per-User Keys) ---
USER_PLUGIN_API_KEY_HEADER_NAME = "X-Plugin-API-Key"
ACTING_USER_ID_HEADER_NAME = "X-Acting-User-ID"

user_plugin_api_key_header = APIKeyHeader(name=USER_PLUGIN_API_KEY_HEADER_NAME, auto_error=False)
acting_user_id_header = APIKeyHeader(name=ACTING_USER_ID_HEADER_NAME, auto_error=False) # Not a security scheme, just a header

async def get_authenticated_plugin_user(
    user_provided_key: Optional[str] = Security(user_plugin_api_key_header),
    acting_user_id: Optional[str] = Header(None, alias=ACTING_USER_ID_HEADER_NAME)
) -> User:
    if not user_provided_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User Plugin API Key is missing")
    if not acting_user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{ACTING_USER_ID_HEADER_NAME} header is missing")

    # Ensure the acting user exists in the DB
    user_dict = await ensure_user_in_db(acting_user_id) # Modified call, removed client passing
    if not user_dict:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Acting user ID {acting_user_id} could not be established in the system.")

    # Now, verify the provided API key against the one stored (hashed) for this user
    is_valid = await db_verify_user_api_key(acting_user_id, user_provided_key)

    if not is_valid:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid User Plugin API Key.")

    # Key is valid, return the user data (as a Pydantic model)
    # Important: The stored key is the HASH, don't return it! Create user model from fetched dict.
    user_dict.pop('plugin_api_key', None) # Don't expose hash
    user_dict.pop('_id', None) # Remove MongoDB internal ID
    return User(**user_dict)

# Helper function to ensure user exists in db_users, fetching from Discord if not
# Now returns the user dict from DB or None if fetch failed critically
async def ensure_user_in_db(user_id_to_check: str) -> Optional[Dict[str, Any]]:
    user = await db_get_user(user_id_to_check)
    if user:
        return user # User already exists

    print(f"User {user_id_to_check} not in DB. Attempting to fetch/create.")

    # Attempt to fetch from Discord API
    if not settings.DISCORD_BOT_TOKEN:
        print(f"WARNING: Cannot fetch profile for new user {user_id_to_check} - Bot token not configured.")
        # Add a minimal user entry
        minimal_user_data = {
            "user_id": user_id_to_check,
            "username": f"User_{user_id_to_check[:6]}",
            "profile_picture_url": None,
            "social_credits_given": [],
            "servers": [], # Should be empty for a new minimal user
            "plugin_api_key": None,
            "plugin_api_key_generated_at": None
        }
        await db_upsert_user(minimal_user_data)
        print(f"Added minimal entry for user {user_id_to_check} due to missing bot token.")
        return await db_get_user(user_id_to_check)

    discord_api_url = f"https://discord.com/api/v10/users/{user_id_to_check}"
    headers_bot_auth = {"Authorization": f"Bot {settings.DISCORD_BOT_TOKEN}"} # Renamed to avoid confusion with OAuth headers
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(discord_api_url, headers=headers_bot_auth)
            if response.status_code == 200:
                user_data = response.json()
                username = user_data.get("username", f"User_{user_id_to_check[:6]}")
                avatar_hash = user_data.get("avatar")
                avatar_full_url = None
                if avatar_hash:
                    extension = "gif" if avatar_hash.startswith("a_") else "png"
                    avatar_full_url = f"https://cdn.discordapp.com/avatars/{user_id_to_check}/{avatar_hash}.{extension}?size=128"
                
                new_user_data = {
                    "user_id": user_id_to_check,
                    "username": username,
                    "profile_picture_url": avatar_full_url,
                    "social_credits_given": [],
                    "servers": [], # Default to empty, servers are populated by OAuth callback or plugin activity
                    "plugin_api_key": None,
                    "plugin_api_key_generated_at": None
                }
                await db_upsert_user(new_user_data)
                print(f"Fetched and added new user {username} (ID: {user_id_to_check}) to DB.")
                return await db_get_user(user_id_to_check)
            else:
                print(f"Failed to fetch profile for new user {user_id_to_check} from Discord (Status: {response.status_code}). Adding minimal entry.")
                # Add minimal user
                minimal_user_data = {
                    "user_id": user_id_to_check,
                    "username": f"User_{user_id_to_check[:6]}",
                     "profile_picture_url": None,
                    "social_credits_given": [],
                    "servers": [],
                    "plugin_api_key": None,
                    "plugin_api_key_generated_at": None
                }
                await db_upsert_user(minimal_user_data)
                return await db_get_user(user_id_to_check)
        except Exception as e:
            print(f"Error fetching profile for new user {user_id_to_check}: {e}. Adding minimal entry.")
            # Add minimal user
            minimal_user_data = {
                    "user_id": user_id_to_check,
                    "username": f"User_{user_id_to_check[:6]}",
                     "profile_picture_url": None,
                    "social_credits_given": [],
                    "servers": [],
                    "plugin_api_key": None,
                    "plugin_api_key_generated_at": None
                }
            await db_upsert_user(minimal_user_data)
            return await db_get_user(user_id_to_check)

# --- OAuth Helper --- 
# Need a way to get the DB for creating tokens/handling callbacks
# We will adjust get_current_user and the callback logic

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/discord/token") # Placeholder, adjust if needed

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
    token_url = 'https://discord.com/api/v10/oauth2/token'
    payload = {
        "client_id": settings.DISCORD_CLIENT_ID,
        "client_secret": settings.DISCORD_CLIENT_SECRET,
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": settings.DISCORD_REDIRECT_URI,
    }

    headers = {
        'Content-Type': 'application/x-www-form-urlencoded'
    }

    async with httpx.AsyncClient() as client:
        try:
            # 1. Exchange code for token
            response = await client.post(token_url, data=payload, headers=headers)
            if response.status_code != 200:
                print(f"Error exchanging code: {response.status_code} {response.text}")
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to exchange Discord code for token")
            token_data = response.json()
            access_token = token_data['access_token']

            # 2. Get user info from Discord using the access token
            user_info_url = 'https://discord.com/api/v10/users/@me'
            headers = {'Authorization': f'Bearer {access_token}'}
            response = await client.get(user_info_url, headers=headers)
            if response.status_code != 200:
                print(f"Error fetching user info: {response.status_code} {response.text}")
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to fetch user info from Discord")
            user_info = response.json()
            user_id = user_info['id']

            # 2.5. Get user's guilds (servers) from Discord
            user_guilds_list: List[Dict[str, Any]] = []
            guilds_url = settings.DISCORD_USER_GUILDS_URL
            # OAuth headers are already defined as 'headers' variable with the Bearer token
            guilds_response = await client.get(guilds_url, headers=headers) 
            if guilds_response.status_code == 200:
                raw_guilds_data = guilds_response.json()
                for guild_data in raw_guilds_data:
                    user_guilds_list.append({
                        "id": guild_data["id"],
                        "name": guild_data["name"],
                        "icon": guild_data.get("icon")
                    })
                print(f"Fetched {len(user_guilds_list)} guilds for user {user_id}.") # Corrected: use user_id
            else:
                print(f"Warning: Failed to fetch guilds for user {user_id}. Status: {guilds_response.status_code} - {guilds_response.text}") # Corrected: use user_id

            # 3. Upsert user in our database
            # Construct avatar URL
            avatar_hash = user_info.get("avatar")
            avatar_full_url = None
            if avatar_hash:
                extension = "gif" if avatar_hash.startswith("a_") else "png"
                avatar_full_url = f"https://cdn.discordapp.com/avatars/{user_id}/{avatar_hash}.{extension}?size=128"
            
            # Check if user already exists to preserve fields like servers/credits
            existing_user_dict = await db_get_user(user_id)
            
            user_data_for_db = {
                "user_id": user_id,
                "username": user_info.get("username", f"User_{user_id[:6]}"),
                "profile_picture_url": avatar_full_url,
                # Preserve existing fields if user exists, otherwise initialize/update
                "social_credits_given": existing_user_dict.get("social_credits_given", []) if existing_user_dict else [],
                "servers": user_guilds_list if user_guilds_list else (existing_user_dict.get("servers", []) if existing_user_dict else []),
                # Preserve API key info if user exists
                "plugin_api_key": existing_user_dict.get("plugin_api_key") if existing_user_dict else None,
                "plugin_api_key_generated_at": existing_user_dict.get("plugin_api_key_generated_at") if existing_user_dict else None
            }

            await db_upsert_user(user_data_for_db)

            # 4. Create JWT token for our frontend
            jwt_data = {"sub": user_id} # Using Discord user ID as subject
            jwt_token = create_access_token(data=jwt_data)

            # 5. Redirect user back to frontend with the JWT token
            # Important: Do NOT put the token directly in the URL fragment like this in production.
            # Use a more secure method like posting to a redirect handler page
            # or using HttpOnly cookies if frontend and backend are same-site.
            # For this example, we'll use a URL fragment.
            redirect_url = f"{settings.FRONTEND_REDIRECT_URI}?token={jwt_token}" # Send token as query param
            return RedirectResponse(url=redirect_url)

        except httpx.HTTPStatusError as e:
            # Log the error details from Discord if possible
            error_detail = e.response.json() if e.response else str(e)
            print(f"Discord API Error: {error_detail}") # Log to server console
            raise HTTPException(status_code=e.response.status_code, detail=f"Error communicating with Discord: {str(error_detail)}")
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
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    # Fetch user from DB instead of in-memory dict
    user_dict = await db_get_user(user_id)
    if user_dict is None:
        print(f"User ID {user_id} from valid JWT not found in DB!") # Should not happen if OAuth callback works
        # Optionally, try ensure_user_in_db here?
        # Or just raise error, as user should exist post-login.
        raise credentials_exception # Treat as invalid credentials if user vanished from DB
    
    # Remove sensitive/internal fields before returning
    user_dict.pop('_id', None)
    user_dict.pop('plugin_api_key', None) # Don't expose hash
    
    return User(**user_dict)

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
    # The current_user object fetched by dependency contains server info
    # Need to make sure the User model loaded by get_current_user includes `servers`
    # Assuming `get_user` retrieves the full user document including the `servers` array
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
            detail="Acting user ID does not match authenticated user"
        )
    
    # Ensure target user exists in DB (create if not, using helper)
    target_user_dict = await ensure_user_in_db(target_user_id)
    if not target_user_dict:
         raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Target user {target_user_id} could not be established.")

    # Fetch the acting user's current data from DB (current_user is from JWT, might be slightly stale)
    acting_user_dict = await db_get_user(acting_user_id)
    if not acting_user_dict:
        # Should not happen if get_current_user worked
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Authenticated user not found in DB.")

    # Find or create the social credit target entry within the acting user's document
    social_credits_given = acting_user_dict.get("social_credits_given", [])
    target_entry = None
    target_entry_index = -1
    for i, entry in enumerate(social_credits_given):
        if entry.get("target_user_id") == target_user_id:
            target_entry = entry
            target_entry_index = i
            break

    # If no existing entry for this target, create a new one
    if target_entry is None:
        target_entry = {
            "target_user_id": target_user_id,
            "scores_history": []
        }
        social_credits_given.append(target_entry)
        target_entry_index = len(social_credits_given) - 1 # It's now the last element

    # Calculate the new absolute score
    last_score = target_entry["scores_history"][-1]["score_value"] if target_entry["scores_history"] else 0
    new_score = last_score + update_request.score_delta

    # Create the new score history entry
    new_score_entry = ScoreEntry(
        score_value=new_score,
        reason=update_request.reason,
        server_id=update_request.server_id,
        channel_id=update_request.channel_id,
        message_id=update_request.message_id,
        message_content_snippet=update_request.message_content_snippet
    ).model_dump() # Convert Pydantic model to dict for DB

    # Append the new score entry to the history
    target_entry["scores_history"].append(new_score_entry)

    # Update the acting user's document in the database
    # We need to update the specific element in the social_credits_given array
    # or the whole array if it was newly created.
    await db_upsert_user(acting_user_dict) # Upsert the whole user doc with updated credits

    # Return the updated target entry (convert back to Pydantic model)
    return UserSocialCreditTarget(**target_entry)

@app.delete("/users/{acting_user_id}/credit/{target_user_id}/latest", response_model=UserSocialCreditTarget)
async def delete_latest_social_credit_entry(
    acting_user_id: str, 
    target_user_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Deletes the most recent score entry given by the acting_user to the target_user.
    """
    if acting_user_id != current_user.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acting user ID does not match authenticated user"
        )

    # Fetch the acting user's data
    acting_user_dict = await db_get_user(acting_user_id)
    if not acting_user_dict:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Acting user not found")

    social_credits_given = acting_user_dict.get("social_credits_given", [])
    target_entry = None
    target_entry_found = False

    for entry in social_credits_given:
        if entry.get("target_user_id") == target_user_id:
            target_entry = entry
            target_entry_found = True
            break

    if not target_entry_found:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"No credit history found for target user {target_user_id}")

    if not target_entry.get("scores_history"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No score entries to delete")

    # Remove the last entry from the scores history
    deleted_entry = target_entry["scores_history"].pop()
    print(f"Deleted score entry: {deleted_entry}")

    # Update the user document in the database
    await db_upsert_user(acting_user_dict)

    # Return the modified target entry
    return UserSocialCreditTarget(**target_entry)

@app.delete("/users/{acting_user_id}/tracking/{target_user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def untrack_user_and_delete_history(
    acting_user_id: str,
    target_user_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Removes the entire social credit history given by the acting_user to the target_user,
    effectively "untracking" them from the acting_user's perspective in terms of scores.
    """
    if acting_user_id != current_user.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acting user ID does not match authenticated user"
        )

    # Fetch the acting user's data
    acting_user_dict = await db_get_user(acting_user_id)
    if not acting_user_dict:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Acting user not found")

    social_credits_given = acting_user_dict.get("social_credits_given", [])
    initial_length = len(social_credits_given)

    # Filter out the entry for the target user
    updated_social_credits = [entry for entry in social_credits_given if entry.get("target_user_id") != target_user_id]

    if len(updated_social_credits) == initial_length:
        # No entry was found for the target user, still return success (idempotent)
        print(f"No tracking entry found for target {target_user_id} under user {acting_user_id}, no action needed.")
        # Return 204 No Content implicitly
        return

    # Update the user's social credits list
    acting_user_dict["social_credits_given"] = updated_social_credits

    # Update the user document in the database
    await db_upsert_user(acting_user_dict)

    print(f"Removed tracking and history for target {target_user_id} by user {acting_user_id}")
    # Return 204 No Content implicitly by FastAPI if no body is returned
    return None

@app.get("/servers", response_model=List[Server])
async def get_servers():
    # This needs rethinking. How do we get *all* servers?
    # Querying the entire collection might be inefficient for very large numbers of servers.
    # For now, let's fetch all servers. Add pagination or filtering if performance becomes an issue.
    if db is None: # Corrected check: Use 'is None'
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database not available")
    
    servers_cursor = db[settings.MONGODB_SERVER_COLLECTION].find()
    servers_list = await servers_cursor.to_list(length=None) # Fetch all servers; use a sensible limit in production
    # Remove MongoDB internal ID before returning
    for server in servers_list:
        server.pop('_id', None)
    return [Server(**server) for server in servers_list]

@app.get("/servers/{server_id}/users", response_model=List[User])
async def get_server_users(server_id: str):
    # Fetch the server document
    server_dict = await db_get_server(server_id)
    if not server_dict:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Server {server_id} not found")

    user_ids = server_dict.get("user_ids", [])
    if not user_ids:
        return []

    # Fetch user details for each user ID
    # This can be inefficient (N+1 problem). Consider optimizing if needed.
    # Need to import db here as well, or use a db connection from a dependency?
    # Let's import db for now.
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database not available")
    users_cursor = db[settings.MONGODB_USER_COLLECTION].find({"user_id": {"$in": user_ids}})
    users_list = await users_cursor.to_list(length=len(user_ids))
    # Remove sensitive fields
    for user in users_list:
        user.pop('_id', None)
        user.pop('plugin_api_key', None)
    return [User(**user) for user in users_list]

@app.get("/users/{user_id}/credit/given", response_model=List[UserSocialCreditTarget])
async def get_social_credit_given_by_user(user_id: str):
    """Get all social credit targets and histories initiated by a specific user."""
    user_dict = await db_get_user(user_id)
    if not user_dict:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"User {user_id} not found")
    
    social_credits_given = user_dict.get("social_credits_given", [])
    # Convert list of dicts to list of Pydantic models
    return [UserSocialCreditTarget(**entry) for entry in social_credits_given]

@app.get("/users/{user_id}/credit/given/{target_user_id}", response_model=UserSocialCreditTarget)
async def get_social_credit_given_to_target(user_id: str, target_user_id: str):
    """Get the specific social credit history for a target user, as rated by user_id."""
    user_dict = await db_get_user(user_id)
    if not user_dict:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"User {user_id} not found")

    social_credits_given = user_dict.get("social_credits_given", [])
    for entry in social_credits_given:
        if entry.get("target_user_id") == target_user_id:
            return UserSocialCreditTarget(**entry)
    
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"No credit history found from user {user_id} for target {target_user_id}")

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
    Fetches a detailed user profile from Discord API, potentially augmenting with local server info.
    Always attempts to return *some* user data if the user exists or can be minimally created.
    """
    # Ensure user exists locally (fetch/create minimal if not)
    user_dict = await ensure_user_in_db(user_id_to_lookup)

    # If ensure_user_in_db failed (e.g., DB error), it would return None
    if not user_dict:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to retrieve or create user in database.")

    # Try to fetch fresh full profile from Discord API for latest details
    if not settings.DISCORD_BOT_TOKEN:
        # If no bot token, return the potentially minimal data from our DB
        print(f"No bot token. Returning stored data for {user_id_to_lookup}.")
        return DiscordUserProfile(
            id=user_dict['user_id'],
            username=user_dict['username'],
            discriminator="0000", # Placeholder
            avatar_url=user_dict.get('profile_picture_url'),
            associatedServerIds=[s['id'] for s in user_dict.get('servers', [])] # Extract server IDs
        )
        
    discord_api_url = f"https://discord.com/api/v10/users/{user_id_to_lookup}"
    headers = {"Authorization": f"Bot {settings.DISCORD_BOT_TOKEN}"}
    updated_user_profile = None

    async with httpx.AsyncClient() as client:
        try:
            print(f"Attempting Discord API lookup for {user_id_to_lookup}...")
            response = await client.get(discord_api_url, headers=headers)
            
            if response.status_code == 200:
                print(f"Discord API success for {user_id_to_lookup}.")
                user_data = response.json()
                avatar_hash = user_data.get("avatar")
                user_id = user_data.get("id")
                username = user_data.get("username")
                discriminator = user_data.get("discriminator")
                
                avatar_full_url = None
                if avatar_hash and user_id:
                    extension = "gif" if avatar_hash.startswith("a_") else "png"
                    avatar_full_url = f"https://cdn.discordapp.com/avatars/{user_id}/{avatar_hash}.{extension}?size=128"

                # Prepare the profile object to return
                updated_user_profile = DiscordUserProfile(
                    id=user_id if user_id else user_id_to_lookup, # Fallback ID
                    username=username if username else user_dict.get('username'), # Fallback username
                    discriminator=discriminator if discriminator else "0000", # Fallback discriminator
                    avatar=avatar_hash,
                    avatar_url=avatar_full_url,
                    banner=user_data.get("banner"),
                    accent_color=user_data.get("accent_color"),
                    public_flags=user_data.get("public_flags"),
                    # Get associated servers from the current DB record
                    associatedServerIds=[s['id'] for s in user_dict.get('servers', [])]
                )

                # Also, update our database record with the fresh info (if different)
                db_update_data = {}
                if username and username != user_dict.get('username'):
                    db_update_data['username'] = username
                if avatar_full_url != user_dict.get('profile_picture_url'): # Check if URL changed
                    db_update_data['profile_picture_url'] = avatar_full_url
                
                if db_update_data:
                    print(f"Updating DB for {user_id} with: {db_update_data}")
                    await db_update_user_fields(user_id, db_update_data)
            
            elif response.status_code == 404:
                print(f"Discord API returned 404 for {user_id_to_lookup}. User not found on Discord.")
                # DO NOT raise HTTPException. We will return the existing minimal data.
                pass # Fall through to return user_dict data
            
            else:
                # Handle other non-200, non-404 errors from Discord
                error_detail_text = response.text
                print(f"Discord API Error ({response.status_code}) fetching user {user_id_to_lookup}: {error_detail_text}")
                # Don't raise, but maybe log this more formally? Fall through to return user_dict data.
                pass # Fall through

        except httpx.RequestError as e:
            # Network errors, timeouts etc.
            print(f"HTTPX RequestError fetching user {user_id_to_lookup}: {e}")
            # Fall through to return existing data
            pass
        except Exception as e:
            # Other unexpected errors
            print(f"Generic error during Discord fetch for {user_id_to_lookup}: {e}")
            # Fall through to return existing data
            pass

    # If Discord fetch was successful and created an updated profile, return that
    if updated_user_profile:
        return updated_user_profile
    else:
        # If Discord fetch failed (404, other error, network issue) or was skipped (no token),
        # return the profile constructed from the data we definitely have (from ensure_user_in_db)
        print(f"Discord fetch failed or skipped for {user_id_to_lookup}. Returning data from DB.")
        return DiscordUserProfile(
            id=user_dict['user_id'],
            username=user_dict['username'],
            discriminator="0000", # Placeholder if Discord fetch failed
            avatar_url=user_dict.get('profile_picture_url'),
            associatedServerIds=[s['id'] for s in user_dict.get('servers', [])]
        )

@app.get("/discord/servers/{server_id}/members/{user_id_to_check}/is-member", response_model=GuildMemberStatus)
async def check_guild_membership(
    server_id: str,
    user_id_to_check: str,
    current_user: User = Depends(get_current_user) # Authenticated app user
):
    """
    Checks if a user is a member of a specific Discord server using the Bot.
    """
    # Ensure the user being checked exists in our system (minimal check)
    # We don't strictly *need* this for the Discord API call, but good practice
    await ensure_user_in_db(user_id_to_check)

    if not settings.DISCORD_BOT_TOKEN:
        print(f"Error checking membership for {user_id_to_check} in {server_id}: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error contacting Discord API")

# --- User Plugin API Key Endpoints (Refactored for DB & Hashing) ---

@app.get("/users/me/plugin-api-key-status", response_model_exclude_none=True)
async def get_user_plugin_api_key_status(current_user: User = Depends(get_current_user)):
    """
    Returns whether the user has an API key and when it was generated.
    """
    # Fetch the latest user data directly from DB to ensure freshness
    user_dict = await db_get_user(current_user.user_id)
    if not user_dict:
        raise HTTPException(status_code=404, detail="User not found") # Should not happen

    if user_dict.get("plugin_api_key"):
        return {
            "has_api_key": True,
            "generated_at": user_dict.get("plugin_api_key_generated_at")
        }
    else:
        return {"has_api_key": False}

@app.post("/users/me/plugin-api-key", response_model=PluginApiKeyResponse)
async def generate_user_plugin_api_key(current_user: User = Depends(get_current_user)):
    """
    Generates a new API key for the user, replacing any existing one.
    """
    new_api_key = secrets.token_urlsafe(32) # Generate a secure random key
    generated_at = datetime.now(timezone.utc)

    # Update the key in the database (hashing is handled by the db function)
    await db_update_user_api_key(current_user.user_id, new_api_key, generated_at)
    
    # IMPORTANT: Return the *plaintext* key to the user ONLY this one time.
    # Do not store the plaintext key anywhere.
    return {
        "api_key": new_api_key,
        "generated_at": generated_at
    }

@app.delete("/users/me/plugin-api-key", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_user_plugin_api_key(current_user: User = Depends(get_current_user)):
    """
    Revokes the user's API key by removing it from the database.
    """
    # Fetch user data
    user_dict = await db_get_user(current_user.user_id)
    if not user_dict:
        raise HTTPException(status_code=404, detail="User not found") # Should not happen
       
    # Set API key fields to None
    user_dict['plugin_api_key'] = None
    user_dict['plugin_api_key_generated_at'] = None
    
    # Update the user in the database
    await db_upsert_user(user_dict)
    
    # Return 204 No Content
    return None

@app.post("/plugin/ratings", response_model=UserSocialCreditTarget, status_code=status.HTTP_201_CREATED)
async def create_rating_from_plugin(
    rating_data: PluginRatingCreate,
    authenticated_acting_user: User = Depends(get_authenticated_plugin_user) # Already verified API key
):
    """
    Receives a rating submission from the Discord plugin.
    """
    acting_user_id = authenticated_acting_user.user_id
    target_user_id = rating_data.target_user_id
    server_id = rating_data.server_id
    channel_id = rating_data.channel_id
    message_id = rating_data.message_id
    score_delta = rating_data.score_delta

    # Validate acting_user_id from token matches payload (redundant due to Depends? Good sanity check)
    if acting_user_id != rating_data.acting_user_id:
         raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Authenticated user ID does not match acting_user_id in payload")

    # Ensure target user exists in DB (create if not, using helper)
    target_user_dict = await ensure_user_in_db(target_user_id)
    if not target_user_dict:
         raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Target user {target_user_id} could not be established.")

    # Fetch the acting user's current data from DB
    # authenticated_acting_user is from get_authenticated_plugin_user, which uses db_get_user internally now
    # but let's refetch to be sure we have the absolute latest for the update.
    acting_user_dict = await db_get_user(acting_user_id)
    if not acting_user_dict:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Authenticated user not found in DB.")

    # --- Add Server Info --- 
    # Check if this server is already associated with the acting user
    server_known = False
    if "servers" in acting_user_dict:
        for server in acting_user_dict["servers"]:
            if server.get("id") == server_id:
                server_known = True
                break
    else:
         acting_user_dict["servers"] = [] # Initialize if missing

    # If server is not known, fetch its details from Discord and add it
    # (We need bot token for this)
    if not server_known and settings.DISCORD_BOT_TOKEN:
        print(f"Server {server_id} not tracked by user {acting_user_id}. Fetching info...")
        guild_info_url = f"https://discord.com/api/v10/guilds/{server_id}"
        headers = {"Authorization": f"Bot {settings.DISCORD_BOT_TOKEN}"}
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(guild_info_url, headers=headers)
                if response.status_code == 200:
                    guild_data = response.json()
                    new_server_info = UserServerInfo(
                        id=guild_data['id'],
                        name=guild_data['name'],
                        icon=guild_data.get('icon')
                    ).model_dump()
                    acting_user_dict["servers"].append(new_server_info)
                    # No need to call upsert_server separately, user doc update handles it
                    print(f"Added server {guild_data['name']} to user {acting_user_id}'s list.")
                else:
                    print(f"WARN: Failed to fetch info for server {server_id}. Status: {response.status_code}")
                    # Optionally add a placeholder server entry?
                    # acting_user_dict["servers"].append(UserServerInfo(id=server_id, name=f"Server {server_id[:6]}").model_dump())
            except Exception as e:
                print(f"WARN: Error fetching info for server {server_id}: {e}")
    elif not server_known:
         print(f"WARN: Cannot fetch info for server {server_id} as Bot Token is not configured.")
         # Optionally add a placeholder server entry
         # acting_user_dict["servers"].append(UserServerInfo(id=server_id, name=f"Server {server_id[:6]}").model_dump())

    # --- Update Social Credit Score --- 
    social_credits_given = acting_user_dict.get("social_credits_given", [])
    target_entry = None
    for entry in social_credits_given:
        if entry.get("target_user_id") == target_user_id:
            target_entry = entry
            break

    if target_entry is None:
        target_entry = {"target_user_id": target_user_id, "scores_history": []}
        social_credits_given.append(target_entry)

    last_score = target_entry["scores_history"][-1]["score_value"] if target_entry["scores_history"] else 0
    new_score = last_score + score_delta

    new_score_entry = ScoreEntry(
        score_value=new_score,
        server_id=server_id,   # Add context from plugin
        channel_id=channel_id, # Add context from plugin
        message_id=message_id, # Add context from plugin
        # timestamp added by default
        # Reason is optional/not included per PluginRatingCreate model
    ).model_dump()

    target_entry["scores_history"].append(new_score_entry)

    # Update the acting user's document in the database with new score AND potentially new server
    await db_upsert_user(acting_user_dict)

    # Return the updated target entry
    return UserSocialCreditTarget(**target_entry)

@app.get("/users/{acting_user_id}/rated-users", response_model=List[DiscordUserProfile])
async def get_rated_users(
    acting_user_id: str,
    current_user: User = Depends(get_current_user) # Authenticated user
):
    """
    Gets profiles of all users that the acting_user_id has rated.
    """
    if acting_user_id != current_user.user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot fetch rated users for another user")

    # Fetch the acting user's data from DB
    acting_user_dict = await db_get_user(acting_user_id)
    if not acting_user_dict:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Acting user not found")

    social_credits_given = acting_user_dict.get("social_credits_given", [])
    # target_user_ids = {entry["target_user_id"] for entry in social_credits_given if "target_user_id" in entry}

    # if not target_user_ids:
    #     return []
    
    rated_user_profiles = []
    # Iterate through each user the acting_user has rated
    for credit_entry in social_credits_given:
        target_id = credit_entry.get("target_user_id")
        if not target_id:
            continue

        # Collect unique server_ids from this target_id's score history within this credit_entry
        associated_server_ids_for_this_target = set()
        if "scores_history" in credit_entry:
            for score_entry in credit_entry["scores_history"]:
                if score_entry.get("server_id"):
                    associated_server_ids_for_this_target.add(score_entry["server_id"])
        
        # Fetch the profile for this target_id
        target_user_dict = await db_get_user(target_id)
        profile = None
        if target_user_dict:
            # Construct profile from DB data
             profile = DiscordUserProfile(
                id=target_user_dict['user_id'],
                username=target_user_dict['username'],
                discriminator="0000", # Placeholder
                avatar_url=target_user_dict.get('profile_picture_url'),
                # Use the server IDs collected from the specific rating history
                associatedServerIds=list(associated_server_ids_for_this_target) 
            )
        else:
            # If target user isn't in DB yet (e.g., only rated via plugin, never logged in)
            # try fetching basic info via ensure_user_in_db to at least get a username
            # ensure_user_in_db itself doesn't populate associatedServerIds in this context
            fetched_dict = await ensure_user_in_db(target_id)
            if fetched_dict:
                 profile = DiscordUserProfile(
                    id=fetched_dict['user_id'],
                    username=fetched_dict['username'],
                    discriminator="0000", # Placeholder
                    avatar_url=fetched_dict.get('profile_picture_url'),
                    associatedServerIds=list(associated_server_ids_for_this_target)
                )
            else: # Fallback if ensure_user_in_db also fails to find/create them
                 profile = DiscordUserProfile(
                    id=target_id,
                    username=f"User_{target_id[:6]}",
                    discriminator="0000",
                    associatedServerIds=list(associated_server_ids_for_this_target)
                 )
        
        if profile:
            rated_user_profiles.append(profile)

    return rated_user_profiles

# --- New Endpoint for Message Fetching ---
class DiscordMessage(BaseModel):
    id: str
    content: str
    author_username: str # Combine username#discriminator or just username
    timestamp: datetime
    # Add other fields if needed (e.g., author_id, embeds)

@app.get("/discord/channels/{channel_id}/messages/{message_id}", response_model=DiscordMessage)
async def get_discord_message_content(
    channel_id: str = Path(..., title="The ID of the Discord channel"),
    message_id: str = Path(..., title="The ID of the Discord message"),
    current_user: User = Depends(get_current_user) # Ensure only logged-in users can fetch
):
    """
    Fetches a specific message's content from Discord API using the Bot Token.
    Requires channel_id and message_id.
    """
    if not settings.DISCORD_BOT_TOKEN:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Discord Bot Token not configured, cannot fetch message.")

    discord_api_url = f"https://discord.com/api/v10/channels/{channel_id}/messages/{message_id}"
    headers = {"Authorization": f"Bot {settings.DISCORD_BOT_TOKEN}"}

    async with httpx.AsyncClient() as client:
        try:
            print(f"Fetching message {message_id} from channel {channel_id}...")
            response = await client.get(discord_api_url, headers=headers)

            if response.status_code == 200:
                message_data = response.json()
                author = message_data.get('author', {})
                author_name = author.get('username', 'Unknown User')
                discriminator = author.get('discriminator', '0000')
                full_author_name = f"{author_name}#{discriminator}" if discriminator and discriminator != "0" else author_name

                # Parse timestamp safely
                timestamp_str = message_data.get('timestamp')
                message_timestamp = datetime.now(timezone.utc) # Default fallback
                if timestamp_str:
                    try:
                        message_timestamp = datetime.fromisoformat(timestamp_str)
                    except ValueError:
                        print(f"Warning: Could not parse timestamp '{timestamp_str}' for message {message_id}")
                        # Keep default timestamp

                return DiscordMessage(
                    id=message_data.get('id', message_id),
                    content=message_data.get('content', '(No content or fetch error)'),
                    author_username=full_author_name,
                    timestamp=message_timestamp
                )
            elif response.status_code == 404:
                raise HTTPException(status_code=404, detail="Message not found on Discord (or bot lacks access).")
            elif response.status_code == 403:
                 raise HTTPException(status_code=403, detail="Bot lacks permissions to access this channel/message.")
            else:
                # Handle other errors
                error_detail_text = response.text
                print(f"Discord API Error ({response.status_code}) fetching message {message_id}: {error_detail_text}")
                raise HTTPException(status_code=response.status_code, detail=f"Failed to fetch message from Discord: {error_detail_text}")

        except httpx.RequestError as e:
            print(f"HTTPX RequestError fetching message {message_id}: {e}")
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Network error contacting Discord: {e}")
        except Exception as e:
            print(f"Generic error fetching message {message_id}: {e}")
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="An unexpected error occurred while fetching the message.")

# MONGO_URI = "mongodb://localhost:27017/"
# client = MongoClient(MONGO_URI)
# db = client.social_credit_db

# Further endpoints for servers, users, scores will go here 