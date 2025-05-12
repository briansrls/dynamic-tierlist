import React, { useState, useEffect, useCallback } from 'react';

// Corresponds to DiscordUserProfile from backend
export interface UserProfile {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null; // hash
  avatar_url: string | null;
  banner?: string | null;
  accent_color?: number | null;
  public_flags?: number | null;
  associatedServerIds?: string[]; // New: IDs of servers this user is associated with in this app
}

interface UserSearchProps {
  selectedServerId: string | null; // This is no longer strictly needed for ID lookup but kept for now if component structure is reused.
  // Could be removed if this component is solely for ID lookup.
  onTrackUser: (user: UserProfile) => void;
  currentServerContext: string | null;  // Add this prop to indicate which server we're searching in
}

const UserSearch: React.FC<UserSearchProps> = ({ selectedServerId, onTrackUser, currentServerContext }) => {
  const [userIdInput, setUserIdInput] = useState(''); // Changed from searchTerm
  const [foundUser, setFoundUser] = useState<UserProfile | null>(null); // Changed from results array
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchAttempted, setSearchAttempted] = useState(false); // To know if a search has been tried

  // Renamed from debouncedSearch to reflect new purpose, and removed selectedServerId dependency for now
  const fetchUserById = useCallback(async (idToFetch: string) => {
    if (idToFetch.trim() === '') {
      setFoundUser(null);
      setError(null);
      setSearchAttempted(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    setSearchAttempted(true);
    const token = localStorage.getItem('app_access_token');

    if (!token) {
      setError("Authentication token not found. Please login.");
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(
        `http://localhost:8000/discord/users/${encodeURIComponent(idToFetch)}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `Error: ${response.status}`);
      }

      const data: UserProfile = await response.json();
      setFoundUser(data);
    } catch (err: any) {
      console.error("Fetch user error:", err);
      setError(err.message || 'Failed to fetch user profile.');
      setFoundUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []); // Removed selectedServerId from dependencies

  // Optional: Trigger search on button click instead of debounce, or keep debounce for typed ID
  // For now, let's keep the debounce for consistency, assuming users might type/paste IDs.
  useEffect(() => {
    const handler = setTimeout(() => {
      if (userIdInput.trim() !== '') { // Only search if input is not empty
        fetchUserById(userIdInput);
      } else {
        setFoundUser(null);
        setError(null);
        setSearchAttempted(false);
      }
    }, 700); // Slightly longer debounce for ID input might be nice

    return () => {
      clearTimeout(handler);
    };
  }, [userIdInput, fetchUserById]);

  return (
    <div className="user-search-container">
      <input
        type="text"
        placeholder="Enter numeric Discord profile ID..."
        value={userIdInput}
        onChange={(e) => setUserIdInput(e.target.value)}
        className="user-search-input"
        autoComplete="off"
        name="discord_profile_id_lookup"
        id="discordProfileIdLookupInput"
      />
      {isLoading && <div className="user-search-loading">Fetching user...</div>}
      {error && <div className="user-search-error">Error: {error}</div>}
      {!isLoading && !error && searchAttempted && !foundUser && (
        <div className="user-search-no-results">User not found or ID is invalid.</div>
      )}
      {foundUser && (
        <div className="user-search-result-item">
          <img
            src={foundUser.avatar_url || 'https://cdn.discordapp.com/embed/avatars/0.png'}
            alt={`${foundUser.username}'s avatar`}
            className="user-search-avatar"
          />
          <span className="user-search-username">
            {foundUser.username}#{foundUser.discriminator}
          </span>
          <button onClick={() => onTrackUser(foundUser)}>Track This User</button>
        </div>
      )}
    </div>
  );
};

export default UserSearch;