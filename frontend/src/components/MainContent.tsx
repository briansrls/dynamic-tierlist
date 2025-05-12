import React, { useState, useEffect, useCallback } from 'react';
import ScoreGraph, { ScoreEntry } from './ScoreGraph';
import UserSearch, { UserProfile } from './UserSearch';
import { AppUser, ServerData, GLOBAL_VIEW_SERVER_ID } from '../App';
import AddRatingModal from './AddRatingModal';
import ConfirmationModal from './ConfirmationModal';
import PluginApiSettings from './PluginApiSettings';

// Interface for the "wide" data format for the multi-line graph
export interface MultiLineGraphDataPoint {
  timestamp: number; // Common X-axis value
  [userSpecificDataKey: string]: number | null; // e.g., "USERID_score": 50 or null
}

// Frontend equivalent of GuildMemberStatus from backend
// interface GuildMemberStatus {
//   server_id: string;
//   user_id: string;
//   is_member: boolean;
//   username_in_server?: string | null;
// }

interface MainContentProps {
  selectedServerId: string | null;
  currentUser: AppUser | null;
  userServers: ServerData[];
  globalViewServerId: string;
  trackedUsers: UserProfile[];
  isLoadingTrackedUsers: boolean;
  trackedUsersError: string | null;
  refreshTrackedUsers: () => Promise<void>;
}

// Helper to generate distinct colors for graph lines (defined at module scope or outside component)
const generateColor = (index: number): string => {
  const colors = ["#8884d8", "#82ca9d", "#ffc658", "#ff7300", "#387908", "#00C49F", "#FFBB28", "#FF8042"];
  return colors[index % colors.length];
};

const MainContent: React.FC<MainContentProps> = ({ selectedServerId, currentUser, userServers, globalViewServerId, trackedUsers, isLoadingTrackedUsers, trackedUsersError, refreshTrackedUsers }) => {
  const [isRatingModalOpen, setIsRatingModalOpen] = useState(false);
  const [userToRate, setUserToRate] = useState<UserProfile | null>(null);
  const [ratingError, setRatingError] = useState<string | null>(null);

  // State for multi-line graph of all tracked users
  const [multiLineGraphData, setMultiLineGraphData] = useState<MultiLineGraphDataPoint[]>([]);
  const [lineConfigs, setLineConfigs] = useState<{ dataKey: string; name: string; stroke: string; avatarUrl: string | null }[]>([]);
  const [isLoadingMultiLineGraph, setIsLoadingMultiLineGraph] = useState(false);
  const [multiLineGraphError, setMultiLineGraphError] = useState<string | null>(null);
  // Add state for overall min/max scores for the multi-line graph
  const [overallMinScore, setOverallMinScore] = useState<number>(0);
  const [overallMaxScore, setOverallMaxScore] = useState<number>(100); // Default sensible range
  const [isSubmitting, setIsSubmitting] = useState(false); // Generic submitting state for modal/delete

  // State for Untrack Confirmation Modal
  const [isUntrackConfirmModalOpen, setIsUntrackConfirmModalOpen] = useState(false);
  const [userToUntrack, setUserToUntrack] = useState<UserProfile | null>(null);
  const [isSearchVisible, setIsSearchVisible] = useState(false); // State for search visibility

  const processAndSetMultiLineGraphData = useCallback((usersForGraph: UserProfile[], allScores: Map<string, ScoreEntry[]>) => {
    if (usersForGraph.length === 0) {
      setMultiLineGraphData([]);
      setLineConfigs([]);
      setOverallMinScore(0);
      setOverallMaxScore(100);
      return;
    }

    const newConfigs = usersForGraph.map((user, index) => ({
      dataKey: `${user.id}_score`,
      name: user.username,
      stroke: generateColor(index), // Uses the generateColor from above
      avatarUrl: user.avatar_url,
    }));
    setLineConfigs(newConfigs);

    let allTimestamps = new Set<number>();
    allScores.forEach(userScoreHistory => {
      userScoreHistory.forEach(score => allTimestamps.add(score.timestamp));
    });
    const sortedUniqueTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);

    if (sortedUniqueTimestamps.length === 0 && usersForGraph.length > 0) {
      // Provide a single point at current time with 0 score for each user if no scores exist at all
      // This helps in initializing the graph lines and axes, connectNulls will handle if it's the only point.
      const now = Date.now();
      setMultiLineGraphData(usersForGraph.map(u => ({ timestamp: now, [`${u.id}_score`]: 0 })));
      // Also set overall scores for this empty-but-defined state
      setOverallMinScore(0);
      setOverallMaxScore(100); // Or a smaller default like 10 if 0 is the only value
    } else if (sortedUniqueTimestamps.length === 0) {
      setMultiLineGraphData([]);
      setOverallMinScore(0);
      setOverallMaxScore(100);
    } else {
      const wideData: MultiLineGraphDataPoint[] = sortedUniqueTimestamps.map(ts => {
        const dataPoint: MultiLineGraphDataPoint = { timestamp: ts };
        usersForGraph.forEach(user => {
          const userHistory = allScores.get(user.id) || [];
          const scoreAtTs = userHistory.find(s => s.timestamp === ts);
          dataPoint[`${user.id}_score`] = scoreAtTs ? scoreAtTs.score_value : null;
        });
        return dataPoint;
      });
      setMultiLineGraphData(wideData);

      let minScore = Infinity;
      let maxScore = -Infinity;
      wideData.forEach(dataPoint => {
        newConfigs.forEach(config => {
          const score = dataPoint[config.dataKey];
          if (typeof score === 'number' && !isNaN(score)) {
            minScore = Math.min(minScore, score);
            maxScore = Math.max(maxScore, score);
          }
        });
      });
      setOverallMinScore(isFinite(minScore) ? minScore : 0);
      setOverallMaxScore(isFinite(maxScore) ? maxScore : 100);
    }
  }, []); // Empty dependency array as generateColor is stable (defined outside)

  const fetchAllTrackedUserScores = useCallback(async (usersToFetchScoresFor: UserProfile[]) => {
    if (!currentUser || usersToFetchScoresFor.length === 0) {
      setMultiLineGraphData([]);
      setLineConfigs([]);
      setIsLoadingMultiLineGraph(false); // Ensure loading is false if returning early
      return;
    }
    setIsLoadingMultiLineGraph(true);
    setMultiLineGraphError(null);

    const actingUserId = currentUser.user_id;
    const token = localStorage.getItem('app_access_token');
    if (!token) {
      setMultiLineGraphError("Authentication token not found.");
      setIsLoadingMultiLineGraph(false);
      return;
    }

    const allScoresMap = new Map<string, ScoreEntry[]>();
    let fetchErrorOccurred = false;

    for (const targetUser of usersToFetchScoresFor) {
      try {
        const response = await fetch(`http://localhost:8000/users/${actingUserId}/credit/given/${targetUser.id}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });

        // Backend now returns 200 OK with empty scores_history if no history exists,
        // so a 404 here would mean acting_user or target_user themselves not found by backend.
        if (!response.ok) {
          let errorDetail = `Error fetching scores for ${targetUser.username}: ${response.status}`;
          try {
            const errorData = await response.json();
            errorDetail = errorData.detail || errorDetail;
          } catch (e) { /* Ignore if response isn't JSON */ }
          console.error(errorDetail);
          fetchErrorOccurred = true;
          allScoresMap.set(targetUser.id, []);
        } else {
          const data = await response.json();
          const formattedScores = (data.scores_history || []).map((entry: any) => ({
            ...entry,
            timestamp: new Date(entry.timestamp).getTime(),
          }));
          allScoresMap.set(targetUser.id, formattedScores);
        }
      } catch (err) {
        console.error(`Network or other error fetching scores for user ${targetUser.id}:`, err);
        fetchErrorOccurred = true;
        allScoresMap.set(targetUser.id, []);
      }
    }
    if (fetchErrorOccurred) {
      setMultiLineGraphError("Some user scores could not be fully loaded. Graph may be incomplete or show no data for some users.");
    }
    processAndSetMultiLineGraphData(usersToFetchScoresFor, allScoresMap);
    setIsLoadingMultiLineGraph(false);
  }, [currentUser, processAndSetMultiLineGraphData]);

  // Main data fetching and processing logic
  useEffect(() => {
    console.log("MAINCONTENT: Main data fetch effect. currentUser:", !!currentUser, "trackedUsers prop length:", trackedUsers.length, "selectedServerId:", selectedServerId);

    if (currentUser && trackedUsers.length > 0) {
      let usersToProcessForGraph = trackedUsers;
      // Filter for graph display based on selectedServerId (if not global)
      if (selectedServerId && selectedServerId !== globalViewServerId) {
        console.log(`MAINCONTENT: Main data fetch - Server View for ${selectedServerId}. Filtering tracked users for graph display.`);
        usersToProcessForGraph = trackedUsers.filter(user => user.associatedServerIds?.includes(selectedServerId));
        console.log("Filtered users for graph:", usersToProcessForGraph.map(u => u.username));
      }

      if (usersToProcessForGraph.length > 0) {
        console.log("MAINCONTENT: Main data fetch - Calling fetchAllTrackedUserScores for:", usersToProcessForGraph.map(u => u.username));
        fetchAllTrackedUserScores(usersToProcessForGraph);
      } else {
        console.log("MAINCONTENT: Main data fetch - No users to display on graph. Clearing graph.");
        setMultiLineGraphData([]);
        setLineConfigs([]);
        setMultiLineGraphError(null);
        setIsLoadingMultiLineGraph(false);
      }
    } else if (!currentUser) {
      console.log("MAINCONTENT: Main data fetch - No current user, clearing graph.");
      setMultiLineGraphData([]); setLineConfigs([]); setIsLoadingMultiLineGraph(false); setMultiLineGraphError(null);
    }
    // This effect now depends on the `trackedUsers` prop from App.tsx
  }, [currentUser, trackedUsers, selectedServerId, globalViewServerId, fetchAllTrackedUserScores]);

  const handleTrackUser = async (userToTrack: UserProfile) => {
    if (!currentUser || !selectedServerId) return;

    try {
      // If we're in a specific server view, add a rating to associate the user with this server
      if (selectedServerId !== globalViewServerId) {
        const token = localStorage.getItem('app_access_token');
        if (!token) {
          console.error("No auth token found");
          return;
        }

        // Add a neutral rating (0) to associate the user with this server
        await fetch(`http://localhost:8000/users/${currentUser.user_id}/credit/${userToTrack.id}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            score_delta: 0,
            reason: "Server association",
            server_id: selectedServerId
          }),
        });
      }

      // Refresh the tracked users list
      await refreshTrackedUsers();
    } catch (error) {
      console.error("Error tracking user:", error);
      alert("Failed to track user. Please try again.");
    }
  };

  const openRatingModal = (targetUser: UserProfile) => {
    setUserToRate(targetUser);
    setRatingError(null);
    setIsRatingModalOpen(true);
  };

  const closeRatingModal = () => {
    setIsRatingModalOpen(false);
    setRatingError(null);
  };

  const handleSubmitRating = async (scoreDelta: number, reason: string) => {
    if (!currentUser || !userToRate) {
      setRatingError("Cannot submit rating. User information is missing.");
      throw new Error("User information missing for rating.");
    }
    setIsSubmitting(true);
    setRatingError(null);

    const actingUserId = currentUser.user_id;
    const targetUserId = userToRate.id;
    const token = localStorage.getItem('app_access_token');

    if (!token) {
      setRatingError("Authentication token not found. Please login again.");
      throw new Error("Auth token not found.");
    }

    try {
      const response = await fetch(`http://localhost:8000/users/${actingUserId}/credit/${targetUserId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          score_delta: scoreDelta,
          reason: reason
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        const detail = errorData.detail || `Error: ${response.status}`;
        setRatingError(detail);
        throw new Error(detail);
      }

      console.log('Rating submitted successfully!', await response.json());
      closeRatingModal();
      await refreshTrackedUsers();

    } catch (err: any) {
      console.error("Failed to submit rating:", err);
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveLastRating = async (targetUser: UserProfile) => {
    if (!currentUser) {
      alert("Please log in to remove a rating."); // Or set a more general error state
      return;
    }
    // Optional: Add a confirmation dialog here
    // if (!window.confirm(`Are you sure you want to remove the last rating for ${targetUser.username}?`)) {
    //   return;
    // }

    setIsSubmitting(true); // Use a general submitting indicator
    setMultiLineGraphError(null); // Clear previous graph errors

    const actingUserId = currentUser.user_id;
    const targetUserId = targetUser.id;
    const token = localStorage.getItem('app_access_token');

    if (!token) {
      setMultiLineGraphError("Authentication token not found. Please login again.");
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await fetch(`http://localhost:8000/users/${actingUserId}/credit/${targetUserId}/latest`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        const detail = errorData.detail || `Error: ${response.status}`;
        console.error("Failed to remove last rating:", detail);
        setMultiLineGraphError(detail); // Display error near graph or a general error area
        alert(`Failed to remove last rating: ${detail}`); // Simple alert for now
        throw new Error(detail);
      }

      console.log('Last rating removed successfully for', targetUser.username, await response.json());
      await refreshTrackedUsers();

    } catch (err: any) {
      // Error already logged or alerted by the if(!response.ok) block
      // If it's a network error before response, this will catch it
      if (!multiLineGraphError) { // Avoid overwriting specific API error with generic one
        const errorMessage = err.message || "An unexpected error occurred while removing the rating.";
        setMultiLineGraphError(errorMessage);
        alert(errorMessage);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenUntrackConfirmModal = (targetUser: UserProfile) => {
    setUserToUntrack(targetUser);
    setIsUntrackConfirmModalOpen(true);
  };

  const handleCloseUntrackConfirmModal = () => {
    setUserToUntrack(null);
    setIsUntrackConfirmModalOpen(false);
  };

  const handleConfirmUntrack = async () => {
    if (!userToUntrack || !currentUser) {
      handleCloseUntrackConfirmModal();
      return;
    }

    setIsSubmitting(true);
    const userBeingUntracked = userToUntrack;

    try {
      const token = localStorage.getItem('app_access_token');
      if (!token) {
        alert("Authentication error. Please log in again.");
        setIsSubmitting(false);
        handleCloseUntrackConfirmModal();
        return;
      }

      const response = await fetch(`http://localhost:8000/users/${currentUser.user_id}/tracking/${userBeingUntracked.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok && response.status !== 204) {
        const errorData = await response.json().catch(() => ({ detail: "Failed to untrack user on server." }));
        const detail = errorData.detail || `Error: ${response.status}`;
        console.error("Failed to untrack user (server-side):", detail);
        alert(`Could not untrack user: ${detail}`);
        setIsSubmitting(false);
        handleCloseUntrackConfirmModal();
        return;
      }

      // Refresh the tracked users list from backend
      await refreshTrackedUsers();
      console.log(`Untracked user: ${userBeingUntracked.username}`);

    } catch (error) {
      console.error("Error during untrack operation:", error);
      alert("An unexpected error occurred while untracking the user.");
    } finally {
      setIsSubmitting(false);
      handleCloseUntrackConfirmModal();
    }
  };

  // Determine the list of users to display based on selectedServerId
  const displayedTrackedUsers = React.useMemo(() => {
    if (!selectedServerId || selectedServerId === globalViewServerId) {
      return trackedUsers; // Show all for global view, trackedUsers is already the full list from props
    }
    // For a specific server, filter by associatedServerIds
    return trackedUsers.filter(user => user.associatedServerIds?.includes(selectedServerId));
  }, [trackedUsers, selectedServerId, globalViewServerId]);

  const toggleSearchVisibility = () => {
    setIsSearchVisible(prev => !prev);
  };

  return (
    <div className="main-content-container">
      <div className="main-content-header"> {/* Optional: Add a container for header elements */}
        <button onClick={toggleSearchVisibility} className="icon-button search-toggle-button" title={isSearchVisible ? "Hide Search" : "Show Search"}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20px" height="20px">
            <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
          </svg>
        </button>
        {/* Potentially add other header controls here */}
      </div>

      {/* Conditionally render UserSearch in an animated popup */}
      <div className={`user-search-popup ${isSearchVisible ? 'visible' : ''}`}>
        <UserSearch
          selectedServerId={selectedServerId}
          onTrackUser={handleTrackUser}
          currentServerContext={selectedServerId === globalViewServerId ? null : selectedServerId}
        />
      </div>

      {trackedUsersError && (
        <div className="error-message">
          Error loading tracked users: {trackedUsersError}
        </div>
      )}

      <div className="graph-display-area">
        <ScoreGraph
          data={multiLineGraphData}
          graphTitle={
            selectedServerId === globalViewServerId
              ? "All Tracked Users - Score Overview"
              : `Scores (Perspective: ${userServers.find(s => s && s.id === selectedServerId)?.name || "Selected Server"}`
          }
          lineConfigs={lineConfigs}
          overallMinScore={overallMinScore}
          overallMaxScore={overallMaxScore}
          isLoading={isLoadingMultiLineGraph || isLoadingTrackedUsers}
          error={multiLineGraphError || trackedUsersError}
        />
      </div>

      {displayedTrackedUsers.length > 0 && (
        <div className="tracked-users-container">
          <h3>
            {selectedServerId === globalViewServerId
              ? "All Tracked Users"
              : `Tracked Users in ${userServers.find(s => s && s.id === selectedServerId)?.name || "Selected Server"}`}
          </h3>
          <ul className="tracked-users-list">
            {displayedTrackedUsers.map(user => {
              const displayedServerIcons = (user.associatedServerIds || [])
                .map(serverId => {
                  const server = userServers.find(s => s.id === serverId);
                  console.log(`User ${user.username} server ${serverId} lookup:`, server ? server.name : 'not found');
                  return server;
                })
                .filter(server => !!server) as ServerData[];

              console.log(`User ${user.username} final displayed servers:`, displayedServerIcons.map(s => s.name));
              return (
                <li key={user.id} className="tracked-user-item">
                  <img
                    src={user.avatar_url || 'https://cdn.discordapp.com/embed/avatars/0.png'}
                    alt={`${user.username}'s avatar`}
                    className="tracked-user-avatar"
                  />
                  <span className="tracked-user-username">{user.username}#{user.discriminator}</span>

                  <div className="tracked-user-server-icons">
                    <span className="server-icon-display global-icon-placeholder" title="Tracked Globally">🌍</span>
                    {displayedServerIcons.map(server => (
                      <span key={server.id} className="server-icon-display" title={server.name}>
                        {server.icon === "global_icon_placeholder" ? (
                          <span className="global-icon-placeholder" role="img" aria-label={server.name}>📍</span>
                        ) : server.icon ? (
                          <img src={`https://cdn.discordapp.com/icons/${server.id}/${server.icon}.png?size=32`} alt={server.name} />
                        ) : (
                          <span className="server-initials-placeholder">{server.name.charAt(0).toUpperCase()}</span>
                        )}
                      </span>
                    ))}
                  </div>

                  <div className="tracked-user-actions">
                    <button
                      onClick={() => openRatingModal(user)}
                      className="add-rating-button"
                      disabled={isSubmitting}
                      style={{ marginRight: '5px' }}
                    >
                      Rate
                    </button>
                    <button
                      onClick={() => handleRemoveLastRating(user)}
                      className="undo-last-rating-button icon-button"
                      disabled={isSubmitting}
                      title="Undo last rating"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16px" height="16px">
                        <path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleOpenUntrackConfirmModal(user)}
                      className="untrack-user-button icon-button"
                      disabled={isSubmitting}
                      title={`Stop tracking ${user.username}`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16px" height="16px">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                      </svg>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {isRatingModalOpen && userToRate && currentUser && (
        <AddRatingModal
          isOpen={isRatingModalOpen}
          onClose={closeRatingModal}
          targetUser={userToRate}
          onSubmitRating={handleSubmitRating}
          actingUserId={currentUser.user_id}
        />
      )}

      {isUntrackConfirmModalOpen && userToUntrack && (
        <ConfirmationModal
          isOpen={isUntrackConfirmModalOpen}
          onClose={handleCloseUntrackConfirmModal}
          onConfirm={handleConfirmUntrack}
          title="Untrack User?"
          message={<>Are you sure you want to stop tracking <strong>{userToUntrack.username}#{userToUntrack.discriminator}</strong>? Their score history (from your perspective) will be cleared from this view.</>}
          confirmButtonText="Untrack"
        />
      )}
    </div>
  );
};

export default MainContent; 