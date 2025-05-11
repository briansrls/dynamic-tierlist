from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

class Settings(BaseSettings):
    DISCORD_CLIENT_ID: str = "YOUR_DISCORD_CLIENT_ID_HERE"
    DISCORD_CLIENT_SECRET: str = "YOUR_DISCORD_CLIENT_SECRET_HERE"
    DISCORD_REDIRECT_URI: str = "http://localhost:8000/auth/discord/callback"
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

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding='utf-8', extra='ignore')

settings = Settings() 