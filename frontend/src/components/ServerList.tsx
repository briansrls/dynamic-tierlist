import React, { useState } from 'react';

// Matches UserServerInfo from backend
interface ServerData {
  id: string;
  name: string;
  icon: string | null; // Icon hash from Discord, can be null
}

// Props that ServerList will now accept
interface ServerListProps {
  servers: ServerData[];
  isLoading: boolean;
  error: string | null;
  selectedServerId: string | null; // Added selectedServerId prop
  onSelectServer: (id: string) => void; // Added onSelectServer handler prop
}

// Helper to construct Discord icon URL
const getDiscordIconUrl = (serverId: string, iconHash: string | null): string | undefined => {
  if (!iconHash) return undefined;
  // TODO: Add logic for animated icons (.gif) if guild has 'ANIMATED_ICON' feature
  return `https://cdn.discordapp.com/icons/${serverId}/${iconHash}.png?size=64`; // Request a 64px png
};

// Helper to generate server initials
const getServerInitials = (name: string): string => {
  if (!name || name.trim() === '') return '?';

  const words = name.split(/[\s\-_]+/).filter(word => word.length > 0); // Split by space, hyphen, underscore

  if (words.length === 0) return name.charAt(0)?.toUpperCase() || '?';

  if (words.length === 1) {
    const word = words[0];
    // For a single word, take up to 3 chars if it looks like an acronym or is short
    if (word.length <= 3 && /^[A-Z0-9&]+$/.test(word)) return word.toUpperCase(); // e.g. DGG, R&D, LSF
    return word.charAt(0).toUpperCase();
  }

  // For multiple words, try to get up to 3 initials
  let initials = '';
  let count = 0;
  for (const word of words) {
    if (count < 3) {
      if (word === '&' || word === 'and') { // Treat common conjunctions specially
        if (count > 0) { // Only add & if it's between initials
          initials += '&';
          count++;
        }
      } else if (word.length > 0) {
        initials += word.charAt(0).toUpperCase();
        count++;
      }
    }
    if (count >= 3 && initials.length >= 2) break; // Stop if we have 3 initials, or 2 if one was '&'
  }

  // If somehow still no initials (e.g. name was only "-" or similar), fallback
  if (initials.length === 0) {
    return name.charAt(0)?.toUpperCase() || '?';
  }

  return initials;
};

const ServerList: React.FC<ServerListProps> = ({ servers, isLoading, error, selectedServerId, onSelectServer }) => {
  // Selected server state is now managed by App.tsx, so local state [selectedServerId, setSelectedServerId] is removed.
  // const [selectedServerId, setSelectedServerId] = useState<string | null>(null);

  // Removed the useEffect for fetching data, as it's now passed via props

  // if (isLoading) { // This local loading message is removed as App.tsx handles full-page loading
  //   return <div className="server-list-loading">Loading servers...</div>; 
  // }

  if (error) {
    return <div className="server-list-error">{error}</div>; // Placeholder for error
  }

  // If not loading, no error, and no servers, render nothing or an empty fragment
  if (servers.length === 0) {
    return null; // Or <></>
    // return <div className="server-list-empty">No servers to display.</div>; 
  }

  return (
    <div className="server-list-container">
      {servers.map((server) => (
        <div
          key={server.id}
          className={`server-icon ${selectedServerId === server.id ? 'selected' : ''}`}
          onClick={() => onSelectServer(server.id)} // Use onSelectServer handler
          title={server.name} // Re-added title for usability, can be removed if strictly no tooltips
        >
          <div className="server-icon-image-wrapper">
            {server.icon === "global_icon_placeholder" ? (
              <span className="server-list-global-icon" role="img" aria-label="Global View">🌍</span>
            ) : getDiscordIconUrl(server.id, server.icon) ? (
              <img src={getDiscordIconUrl(server.id, server.icon)} alt={server.name} />
            ) : (
              getServerInitials(server.name) // Use the new helper
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default ServerList; 