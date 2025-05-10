import React from 'react';

interface Server {
  id: string;
  name: string;
  iconUrl?: string; // Optional: for server icons like Discord
}

// Mock data for now - updated with local images
const mockServers: Server[] = [
  { id: 's1', name: 'DGG Scape', iconUrl: '/images/dggscape.webp' },
  { id: 's2', name: 'Chud Logic', iconUrl: '/images/chud.jpg' },
];

const ServerList: React.FC = () => {
  // In the future, fetch servers from the API: GET /servers
  const [servers, setServers] = React.useState<Server[]>(mockServers);
  const [selectedServerId, setSelectedServerId] = React.useState<string | null>(null);

  return (
    <div className="server-list-container">
      {servers.map((server) => (
        <div
          key={server.id}
          className={`server-icon ${selectedServerId === server.id ? 'selected' : ''}`}
          onClick={() => setSelectedServerId(server.id)}
          title={server.name}
        >
          <div className="server-icon-image-wrapper">
            {server.iconUrl ? (
              <img src={server.iconUrl} alt={server.name} />
            ) : (
              server.name.substring(0, 1).toUpperCase()
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default ServerList; 