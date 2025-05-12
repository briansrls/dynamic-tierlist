import React, { useState, useEffect, useCallback } from 'react';
import ScoreGraph, { ScoreEntry } from './ScoreGraph';
import UserSearch, { UserProfile } from './UserSearch';
import { AppUser, ServerData, GLOBAL_VIEW_SERVER_ID } from '../App';
import AddRatingModal from './AddRatingModal';

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
        if (!response.ok) {
          if (response.status === 404) {
            allScoresMap.set(targetUser.id, []); // No history is valid
          } else {
            console.error(`Error fetching scores for ${targetUser.username}: ${response.status}`);
            fetchErrorOccurred = true; // Mark that an error occurred
            allScoresMap.set(targetUser.id, []); // Set empty on error to avoid breaking processor
          }
        } else {
          const data = await response.json();
          const formattedScores = (data.scores_history || []).map((entry: any) => ({
            ...entry,
            timestamp: new Date(entry.timestamp).getTime(),
          }));
          allScoresMap.set(targetUser.id, formattedScores);
        }
      } catch (err) {
        console.error(`Failed to fetch scores for user ${targetUser.id}:`, err);
        fetchErrorOccurred = true;
        allScoresMap.set(targetUser.id, []);
      }
    }
    if (fetchErrorOccurred) {
      setMultiLineGraphError("Some user scores could not be loaded. Graph may be incomplete.");
    }
    processAndSetMultiLineGraphData(currentTrackedUsers, allScoresMap);
    setIsLoadingMultiLineGraph(false);
  }, [currentUser, processAndSetMultiLineGraphData]);

  // Effect for initializing trackedUsers from localStorage on load/login
  useEffect(() => {
    if (currentUser) {
      const storedTrackedUsers = localStorage.getItem(`trackedUsers_${currentUser.user_id}`);
      if (storedTrackedUsers) {
        try {
          const parsedUsers = JSON.parse(storedTrackedUsers);
          setTrackedUsers(parsedUsers);
        } catch (error) {
          console.error("Error parsing tracked users from localStorage:", error);
          localStorage.removeItem(`trackedUsers_${currentUser.user_id}`); // Clear corrupted data
        }
      }
    } else {
      // Clear tracked users if no user is logged in (e.g., on logout)
      setTrackedUsers([]);
      // Also clear their specific localStorage for tracked users
      // This part is tricky: we don't know the previous currentUser.id here easily.
      // It's better to clear localStorage specifically on handleLogout in App.tsx
    }
  }, [currentUser]); // Run when currentUser changes

  // Effect for persisting trackedUsers to localStorage when it changes
  useEffect(() => {
    if (currentUser && trackedUsers.length > 0) {
      localStorage.setItem(`trackedUsers_${currentUser.user_id}`, JSON.stringify(trackedUsers));
    } else if (currentUser && trackedUsers.length === 0) {
      // If list becomes empty for a logged-in user, remove from storage
      localStorage.removeItem(`trackedUsers_${currentUser.user_id}`);
    }
    // This effect should also trigger fetching all tracked user scores if not already handled
    // The existing useEffect for [currentUser, trackedUsers, fetchAllTrackedUserScores] handles this.
  }, [trackedUsers, currentUser]);

  // useEffect for clearing state on logout (this one is fine)
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
    }
    // No longer need to fetch all scores here directly based on currentUser alone,
    // the next effect handles it based on trackedUsers and currentUser.
  }, [currentUser]);

  // Main effect to fetch data for all tracked users.
  // This will run when currentUser or trackedUsers changes.
  // selectedServerId is NOT a dependency here because we are not filtering the *data* by server,
  // only changing the graph title contextually.
  useEffect(() => {
    if (currentUser && trackedUsers.length > 0) {
      console.log("MainContent: Fetching scores for all tracked users. Selected server (for title):", selectedServerId);
      fetchAllTrackedUserScores(trackedUsers);
    } else if (currentUser && trackedUsers.length === 0) {
      setMultiLineGraphData([]);
      setLineConfigs([]);
      setMultiLineGraphError(null);
      setIsLoadingMultiLineGraph(false);
    }
  }, [currentUser, trackedUsers, fetchAllTrackedUserScores]); // Removed selectedServerId, globalViewServerId, filterAndFetchScoresForServer

  const handleTrackUser = (userToTrack: UserProfile) => {
    setTrackedUsers(prevTrackedUsers => {
      if (prevTrackedUsers.find(user => user.id === userToTrack.id)) {
        return prevTrackedUsers;
      }
      return [...prevTrackedUsers, userToTrack];
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
    }
  };

  // Helper to generate distinct colors for graph lines
  const generateColor = (index: number): string => {
    const colors = ["#8884d8", "#82ca9d", "#ffc658", "#ff7300", "#387908", "#00C49F", "#FFBB28", "#FF8042"];
    return colors[index % colors.length];
  };

  return (
    <div className="main-content-container">
      <UserSearch selectedServerId={selectedServerId} onTrackUser={handleTrackUser} />

      <div className="graph-display-area">
        {isLoadingMultiLineGraph && <div className="graph-loading">Loading scores...</div>}
        {multiLineGraphError && <div className="graph-error">Error: {multiLineGraphError}</div>}
        {!isLoadingMultiLineGraph && !multiLineGraphError && (
          <ScoreGraph
            data={multiLineGraphData}
            graphTitle={
              selectedServerId === globalViewServerId
                ? "All Tracked Users - Score Overview"
                // Ensure userServers is available and s.id is checked
                : `Scores (Perspective: ${userServers.find(s => s && s.id === selectedServerId)?.name || "Selected Server"})`
            }
            lineConfigs={lineConfigs}
            overallMinScore={overallMinScore}
            overallMaxScore={overallMaxScore}
          />
        )}
      </div>

      {trackedUsers.length > 0 && (
        <div className="tracked-users-container">
          <h3>Tracked Users:</h3>
          {/* Removed View Scores button, graph is always global now */}
          {/* Individual actions like Rate are still relevant */}
          <ul className="tracked-users-list">
            {trackedUsers.map(user => (
              <li key={user.id} className="tracked-user-item">
                <img
                  src={user.avatar_url || 'https://cdn.discordapp.com/embed/avatars/0.png'}
                  alt={`${user.username}'s avatar`}
                  className="tracked-user-avatar"
                />
                <span className="tracked-user-username">{user.username}#{user.discriminator}</span>
                {/* <button onClick={() => handleViewUserScores(user)} className="view-scores-button" style={{marginRight: '5px'}}>
                  View Scores
                </button> */}
                <button onClick={() => openRatingModal(user)} className="add-rating-button">
                  Rate
                </button>
              </li>
            ))}
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
    </div>
  );
};

export default MainContent; 