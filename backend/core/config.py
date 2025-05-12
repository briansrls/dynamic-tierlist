from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

class Settings(BaseSettings):
    DISCORD_CLIENT_ID: str = "YOUR_DISCORD_CLIENT_ID_HERE"
    DISCORD_CLIENT_SECRET: str = "YOUR_DISCORD_CLIENT_SECRET_HERE"
    DISCORD_REDIRECT_URI: str = "http://localhost:8000/auth/discord/callback" # Where Discord redirects to backend
    FRONTEND_REDIRECT_URI: str = "http://localhost:3000/auth/callback" # Where backend redirects to frontend after success
    DISCORD_BOT_TOKEN: Optional[str] = None # If you plan to use bot functionalities later
    
    # Discord API endpoints
    DISCORD_AUTH_URL: str = "https://discord.com/api/oauth2/authorize"
    DISCORD_TOKEN_URL: str = "https://discord.com/api/oauth2/token"
    DISCORD_USER_INFO_URL: str = "https://discord.com/api/users/@me"
    DISCORD_USER_GUILDS_URL: str = "https://discord.com/api/users/@me/guilds"

    # For session management (example, you might use a more robust secret)
    SECRET_KEY: str = "a_very_secret_key_for_jwt_or_sessions"

    # JWT settings
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 # e.g., 24 hours

    # MongoDB settings
    MONGODB_URI: str = "mongodb://localhost:27017"
    MONGODB_DB_NAME: str = "social_credit_db"
    MONGODB_USER_COLLECTION: str = "users"
    MONGODB_SERVER_COLLECTION: str = "servers"

    # API Key settings
    API_KEY_SALT: str = "your_api_key_salt_here"  # Used for hashing API keys
    API_KEY_ALGORITHM: str = "sha256"  # Algorithm for hashing API keys

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding='utf-8', extra='ignore')

    def __init__(self, **values):
        super().__init__(**values)
        print(f"--- Settings Initialized ---")
        print(f"API_KEY_SALT: {self.API_KEY_SALT}")
        print(f"API_KEY_ALGORITHM: {self.API_KEY_ALGORITHM}")
        print(f"---------------------------")

settings = Settings()
print(f"--- Global settings object created (config.py) --- API_KEY_SALT: {settings.API_KEY_SALT} ---") # Log when global is set 