from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordBearer
from fastapi.middleware.cors import CORSMiddleware # Import CORS middleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from datetime import datetime, timezone

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

class User(BaseModel):
    user_id: str
    username: str
    profile_picture_url: Optional[str] = None
    social_credits_given: List[UserSocialCreditTarget] = []

class Server(BaseModel):
    server_id: str
    server_name: str
    user_ids: List[str] = []

class SocialCreditUpdateRequest(BaseModel):
    score_delta: float
    reason: Optional[str] = None

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
                    user_id=discord_id, # Using Discord ID as our app's user_id for simplicity
                    username=discord_username,
                    profile_picture_url=profile_pic_url,
                    social_credits_given=[] # Initialize empty list
                )
                db_users[discord_id] = app_user
            else:
                # Update existing user details if necessary
                db_users[discord_id].username = discord_username
                db_users[discord_id].profile_picture_url = profile_pic_url
            
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

@app.post("/users/{acting_user_id}/credit/{target_user_id}", response_model=UserSocialCreditTarget)
async def give_social_credit(
    acting_user_id: str,
    target_user_id: str,
    update_request: SocialCreditUpdateRequest
):
    if acting_user_id not in db_users:
        raise HTTPException(status_code=404, detail=f"Acting user {acting_user_id} not found")
    if target_user_id not in db_users:
        raise HTTPException(status_code=404, detail=f"Target user {target_user_id} not found")
    if acting_user_id == target_user_id:
        raise HTTPException(status_code=400, detail="Users cannot give credit to themselves")

    acting_user = db_users[acting_user_id]

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

# Placeholder for future database connection and models
# from pymongo import MongoClient

# MONGO_URI = "mongodb://localhost:27017/"
# client = MongoClient(MONGO_URI)
# db = client.social_credit_db

# Further endpoints for servers, users, scores will go here 