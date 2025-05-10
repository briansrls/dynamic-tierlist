from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from datetime import datetime, timezone

app = FastAPI()

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