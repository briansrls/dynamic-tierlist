from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure
import hashlib
from typing import Optional, Dict, Any
from datetime import datetime, timezone

from .config import settings

# MongoDB client
client: Optional[AsyncIOMotorClient] = None
db = None

async def connect_to_mongodb():
    """Connect to MongoDB and initialize the database."""
    global client, db
    try:
        client = AsyncIOMotorClient(settings.MONGODB_URI)
        # Verify connection
        await client.admin.command('ping')
        db = client[settings.MONGODB_DB_NAME]
        print("Connected to MongoDB!")
    except ConnectionFailure as e:
        print(f"Failed to connect to MongoDB: {e}")
        raise

async def close_mongodb_connection():
    """Close the MongoDB connection."""
    global client
    if client:
        client.close()
        print("Closed MongoDB connection.")

def hash_api_key(api_key: str) -> str:
    """Hash an API key using the configured salt and algorithm."""
    # --- Start Debug Logging for hash_api_key ---
    print(f"--- hash_api_key called ---")
    print(f"Using API_KEY_SALT (from settings object ID: {id(settings)}): '{settings.API_KEY_SALT}'")
    print(f"Using API_KEY_ALGORITHM: '{settings.API_KEY_ALGORITHM}'")
    # --- End Debug Logging for hash_api_key ---
    salted_key = f"{api_key}{settings.API_KEY_SALT}"
    hasher = hashlib.new(settings.API_KEY_ALGORITHM)
    hasher.update(salted_key.encode())
    return hasher.hexdigest()

def verify_api_key(api_key: str, hashed_key: str) -> bool:
    """Verify an API key against its hash."""
    # --- Start Debug Logging ---
    print(f"--- Verifying API Key --- START ---")
    print(f"Received Key (len={len(api_key)}): '{api_key[:4]}...{api_key[-4:]}'") # Avoid logging full key
    print(f"Stored Hash (DB): '{hashed_key}'")
    rehashed_provided_key = hash_api_key(api_key)
    print(f"Re-hashed Received Key: '{rehashed_provided_key}'")
    is_match = rehashed_provided_key == hashed_key
    print(f"Comparison Result: {is_match}")
    print(f"--- Verifying API Key --- END ---")
    # --- End Debug Logging ---
    return is_match

# User operations
async def get_user(user_id: str) -> Optional[Dict[str, Any]]:
    """Get a user by their ID."""
    if db is None:
        raise RuntimeError("Database not initialized")
    return await db[settings.MONGODB_USER_COLLECTION].find_one({"user_id": user_id})

async def upsert_user(user_data: Dict[str, Any]) -> None:
    """Create or update a user."""
    if db is None:
        raise RuntimeError("Database not initialized")
    
    await db[settings.MONGODB_USER_COLLECTION].update_one(
        {"user_id": user_data["user_id"]},
        {"$set": user_data},
        upsert=True
    )

async def update_user_api_key(user_id: str, api_key: str, generated_at: datetime) -> None:
    """Update a user's API key."""
    if db is None:
        raise RuntimeError("Database not initialized")
    
    hashed_key = hash_api_key(api_key)
    await db[settings.MONGODB_USER_COLLECTION].update_one(
        {"user_id": user_id},
        {
            "$set": {
                "plugin_api_key": hashed_key,
                "plugin_api_key_generated_at": generated_at
            }
        }
    )

async def verify_user_api_key(user_id: str, provided_key: str) -> bool:
    """Verify a user's API key."""
    if db is None:
        raise RuntimeError("Database not initialized")
    
    print(f"--- verify_user_api_key called for user: {user_id} ---") # Add context log
    user = await get_user(user_id)
    if not user or not user.get("plugin_api_key"):
        print(f"API Key Verification FAIL: User {user_id} or stored key hash not found in DB.") # Add log
        return False
    
    # The detailed logs are now in the helper verify_api_key
    result = verify_api_key(provided_key, user["plugin_api_key"])
    print(f"--- verify_user_api_key result for user {user_id}: {result} ---") # Add context log
    return result

# Server operations
async def get_server(server_id: str) -> Optional[Dict[str, Any]]:
    """Get a server by its ID."""
    if db is None:
        raise RuntimeError("Database not initialized")
    return await db[settings.MONGODB_SERVER_COLLECTION].find_one({"server_id": server_id})

async def upsert_server(server_data: Dict[str, Any]) -> None:
    """Create or update a server."""
    if db is None:
        raise RuntimeError("Database not initialized")
    await db[settings.MONGODB_SERVER_COLLECTION].update_one(
        {"server_id": server_data["server_id"]},
        {"$set": server_data},
        upsert=True
    )

# Initialize database connection
async def init_db():
    """Initialize the database connection and create indexes."""
    await connect_to_mongodb()
    if db is not None:
        # Create indexes
        await db[settings.MONGODB_USER_COLLECTION].create_index("user_id", unique=True)
        await db[settings.MONGODB_SERVER_COLLECTION].create_index("server_id", unique=True)
        print("Database indexes created.") 