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
}

const MainContent: React.FC<MainContentProps> = ({ selectedServerId, currentUser, userServers, globalViewServerId }) => {
  const [trackedUsers, setTrackedUsers] = useState<UserProfile[]>([]);
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

  const [isInitialTrackedUsersLoaded, setIsInitialTrackedUsersLoaded] = useState(false); // New state

  const processAndSetMultiLineGraphData = useCallback((users: UserProfile[], allScores: Map<string, ScoreEntry[]>) => {
    if (users.length === 0) {
      setMultiLineGraphData([]);
      setLineConfigs([]);
      setOverallMinScore(0); // Reset
      setOverallMaxScore(100); // Reset
      return;
    }

    const newConfigs = users.map((user, index) => ({
      dataKey: `${user.id}_score`,
      name: user.username,
      stroke: generateColor(index),
      avatarUrl: user.avatar_url,
    }));
    setLineConfigs(newConfigs);

    // Aggregate all timestamps and sort them
    let allTimestamps = new Set<number>();
    allScores.forEach(userScoreHistory => {
      userScoreHistory.forEach(score => allTimestamps.add(score.timestamp));
    });
    const sortedUniqueTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);

    if (sortedUniqueTimestamps.length === 0) {
      setMultiLineGraphData([]);
      return;
    }

    // Create the "wide" data format with step-before logic
    const lastScores: { [userId: string]: number } = {};
    users.forEach(user => {
      const userHistory = allScores.get(user.id) || [];
      if (userHistory.length > 0) {
        // Initialize with the score at or before the very first global timestamp
        let initialScore = 0; // Default if no score found before/at first timestamp
        const firstRelevantEntry = userHistory.filter(s => s.timestamp <= sortedUniqueTimestamps[0]).pop();
        if (firstRelevantEntry) {
          initialScore = firstRelevantEntry.score_value;
        }
        lastScores[user.id] = initialScore;
      } else {
        lastScores[user.id] = 0; // Or some other default like null/undefined if preferred by graph
      }
    });

    const wideData: MultiLineGraphDataPoint[] = sortedUniqueTimestamps.map(ts => {
      const dataPoint: MultiLineGraphDataPoint = { timestamp: ts };
      users.forEach(user => {
        const userHistory = allScores.get(user.id) || [];
        const scoreAtTs = userHistory.find(s => s.timestamp === ts);
        if (scoreAtTs) {
          // lastScores[user.id] = scoreAtTs.score_value; // Keep track of last actual score for potential future use by tooltips
          dataPoint[`${user.id}_score`] = scoreAtTs.score_value;
        } else {
          // For connectNulls to work, we explicitly set null if no score at this exact timestamp
          dataPoint[`${user.id}_score`] = null as any; // Cast to any to satisfy MultiLineGraphDataPoint if needed, or adjust interface
        }
      });
      return dataPoint;
    });

    setMultiLineGraphData(wideData);
    // The lastScores logic for step-before might still be useful for tooltips if default behavior isn't right.
    // For now, focusing on connectNulls visual.

    // Calculate overall min/max from the wideData for Y-axis domain setting
    let minScore = Infinity;
    let maxScore = -Infinity;
    if (wideData.length > 0) {
      wideData.forEach(dataPoint => {
        newConfigs.forEach(config => {
          const score = dataPoint[config.dataKey];
          if (typeof score === 'number' && !isNaN(score)) {
            minScore = Math.min(minScore, score);
            maxScore = Math.max(maxScore, score);
          }
        });
      });
    } else {
      minScore = 0;
      maxScore = 100; // Default if no data points
    }
    // If all scores were Infinity/-Infinity (e.g. no actual scores), reset to default
    setOverallMinScore(isFinite(minScore) ? minScore : 0);
    setOverallMaxScore(isFinite(maxScore) ? maxScore : 100);
  }, []);


  const fetchAllTrackedUserScores = useCallback(async (currentTrackedUsers: UserProfile[]) => {
    if (!currentUser || currentTrackedUsers.length === 0) {
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

    for (const targetUser of currentTrackedUsers) {
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
    processAndSetMultiLineGraphData(currentTrackedUsers, allScoresMap);
    setIsLoadingMultiLineGraph(false);
  }, [currentUser, processAndSetMultiLineGraphData]);

  // Effect for initializing trackedUsers from localStorage on load/login
  useEffect(() => {
    console.log("MAINCONTENT: localStorage load effect - currentUser:", currentUser ? currentUser.user_id : "null");
    if (currentUser) {
      const storedTrackedUsers = localStorage.getItem(`trackedUsers_${currentUser.user_id}`);
      if (storedTrackedUsers) {
        try {
          const parsedUsers: UserProfile[] = JSON.parse(storedTrackedUsers);
          parsedUsers.forEach(user => {
            if (!Array.isArray(user.associatedServerIds)) {
              user.associatedServerIds = [];
            }
          });
          console.log("MAINCONTENT: localStorage load effect - setting trackedUsers from storage:", parsedUsers.map(u => u.username));
          setTrackedUsers(parsedUsers);
        } catch (error) {
          console.error("Error parsing tracked users from localStorage:", error);
          localStorage.removeItem(`trackedUsers_${currentUser.user_id}`);
          setTrackedUsers([]); // Set to empty if parsing failed
        }
      } else {
        console.log("MAINCONTENT: localStorage load effect - no stored users, setting to empty.");
        setTrackedUsers([]);
      }
      setIsInitialTrackedUsersLoaded(true); // Mark as loaded/attempted for this currentUser
    } else {
      console.log("MAINCONTENT: localStorage load effect - no currentUser, setting trackedUsers to empty.");
      setTrackedUsers([]);
      setIsInitialTrackedUsersLoaded(false); // Reset when logged out
    }
  }, [currentUser]);

  // Effect for persisting trackedUsers to localStorage (no change needed)
  useEffect(() => {
    if (currentUser && isInitialTrackedUsersLoaded) { // Only save if initial load is done and user exists
      if (trackedUsers.length > 0) {
        localStorage.setItem(`trackedUsers_${currentUser.user_id}`, JSON.stringify(trackedUsers));
      } else {
        localStorage.removeItem(`trackedUsers_${currentUser.user_id}`);
      }
    }
  }, [trackedUsers, currentUser, isInitialTrackedUsersLoaded]);

  // Effect for clearing all component state on logout
  useEffect(() => {
    if (!currentUser) {
      setTrackedUsers([]);
      setIsRatingModalOpen(false);
      setUserToRate(null);
      setRatingError(null);
      setMultiLineGraphData([]);
      setLineConfigs([]);
      setIsLoadingMultiLineGraph(false);
      setMultiLineGraphError(null);
      setOverallMinScore(0);
      setOverallMaxScore(100);
      setIsUntrackConfirmModalOpen(false);
      setUserToUntrack(null);
      setIsInitialTrackedUsersLoaded(false); // Ensure this is reset on logout
    }
  }, [currentUser]);

  // Main data fetching and processing logic
  useEffect(() => {
    console.log("MAINCONTENT: Main data fetch effect. currentUser:", !!currentUser, "isInitialTrackedUsersLoaded:", isInitialTrackedUsersLoaded, "trackedUsers length:", trackedUsers.length, "selectedServerId:", selectedServerId);

    if (currentUser && isInitialTrackedUsersLoaded) {
      if (selectedServerId === globalViewServerId) {
        if (trackedUsers.length > 0) {
          console.log("MAINCONTENT: Main data fetch - Global View - Processing tracked users:", trackedUsers.map(u => u.username));
          fetchAllTrackedUserScores(trackedUsers);
        } else {
          console.log("MAINCONTENT: Main data fetch - Global View - No users tracked, clearing graph.");
          setMultiLineGraphData([]);
          setLineConfigs([]);
          setMultiLineGraphError(null);
          setIsLoadingMultiLineGraph(false);
        }
      } else {
        console.log(`MAINCONTENT: Main data fetch - Server View for ${selectedServerId} - Showing empty (awaiting plugin).`);
        setMultiLineGraphData([]);
        setLineConfigs([]);
        setMultiLineGraphError(null);
        setIsLoadingMultiLineGraph(false);
      }
    } else if (!currentUser) {
      console.log("MAINCONTENT: Main data fetch - No current user, clearing graph.");
      setMultiLineGraphData([]); setLineConfigs([]); setIsLoadingMultiLineGraph(false); setMultiLineGraphError(null);
    }
    // If currentUser exists but isInitialTrackedUsersLoaded is false, this effect waits.
  }, [currentUser, trackedUsers, selectedServerId, globalViewServerId, fetchAllTrackedUserScores, isInitialTrackedUsersLoaded]);

  const handleTrackUser = (userToTrack: UserProfile) => {
    setTrackedUsers(prevTrackedUsers => {
      if (prevTrackedUsers.find(user => user.id === userToTrack.id)) {
        // If user already tracked, potentially add current selectedServerId if not global and not already there
        return prevTrackedUsers.map(user => {
          if (user.id === userToTrack.id) {
            const currentAssociatedServers = user.associatedServerIds || [];
            if (selectedServerId && selectedServerId !== globalViewServerId && !currentAssociatedServers.includes(selectedServerId)) {
              return { ...user, associatedServerIds: [...currentAssociatedServers, selectedServerId] };
            }
          }
          return user;
        });
      }
      // New user to track
      let initialAssociatedServers: string[] = [];
      if (selectedServerId && selectedServerId !== globalViewServerId) {
        initialAssociatedServers.push(selectedServerId);
      }
      return [...prevTrackedUsers, { ...userToTrack, associatedServerIds: initialAssociatedServers }];
    });
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
      fetchAllTrackedUserScores(trackedUsers); // Refresh multi-line graph data

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
      fetchAllTrackedUserScores(trackedUsers); // Refresh graph data

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

  // Helper to generate distinct colors for graph lines
  const generateColor = (index: number): string => {
    const colors = ["#8884d8", "#82ca9d", "#ffc658", "#ff7300", "#387908", "#00C49F", "#FFBB28", "#FF8042"];
    return colors[index % colors.length];
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

    setIsSubmitting(true); // Indicate an operation is in progress
    const userBeingUntracked = userToUntrack; // Store before state is cleared

    try {
      const token = localStorage.getItem('app_access_token');
      if (!token) {
        alert("Authentication error. Please log in again.");
        setIsSubmitting(false);
        handleCloseUntrackConfirmModal();
        return;
      }

      // Call backend to delete score history for this user pair
      const response = await fetch(`http://localhost:8000/users/${currentUser.user_id}/tracking/${userBeingUntracked.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok && response.status !== 204) { // 204 is a success for DELETE with no content
        const errorData = await response.json().catch(() => ({ detail: "Failed to untrack user on server." }));
        const detail = errorData.detail || `Error: ${response.status}`;
        console.error("Failed to untrack user (server-side):", detail);
        alert(`Could not untrack user: ${detail}`);
        // Do not proceed with frontend untrack if backend failed critically
        setIsSubmitting(false);
        handleCloseUntrackConfirmModal();
        return;
      }

      // If backend is successful (200-299 or 204 specifically), then update frontend state
      setTrackedUsers(prevUsers => prevUsers.filter(user => user.id !== userBeingUntracked.id));
      // localStorage update will be triggered by the useEffect watching trackedUsers
      console.log(`Untracked user: ${userBeingUntracked.username} (client-side and server-side scores cleared).`);

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
      return trackedUsers; // Show all for global view
    }
    // For a specific server, filter by associatedServerIds
    // This relies on associatedServerIds being populated correctly when a user is tracked.
    return trackedUsers.filter(user => user.associatedServerIds?.includes(selectedServerId));
  }, [trackedUsers, selectedServerId, globalViewServerId]);

  return (
    <div className="main-content-container">
      <UserSearch selectedServerId={selectedServerId} onTrackUser={handleTrackUser} />

      <div className="graph-display-area">
        <ScoreGraph
          data={multiLineGraphData}
          graphTitle={
            selectedServerId === globalViewServerId
              ? "All Tracked Users - Score Overview"
              : `Scores (Perspective: ${userServers.find(s => s && s.id === selectedServerId)?.name || "Selected Server"})`
          }
          lineConfigs={lineConfigs}
          overallMinScore={overallMinScore}
          overallMaxScore={overallMaxScore}
          isLoading={isLoadingMultiLineGraph}
          error={multiLineGraphError}
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
                .map(serverId => userServers.find(s => s.id === serverId))
                .filter(server => !!server) as ServerData[]; // Filter out undefined and assert type

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