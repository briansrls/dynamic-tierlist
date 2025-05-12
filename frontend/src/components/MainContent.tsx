import React, { useState, useEffect, useCallback } from 'react';
import ScoreGraph, { ScoreEntry } from './ScoreGraph';
import UserSearch, { UserProfile } from './UserSearch';
import { AppUser } from '../App';
import AddRatingModal from './AddRatingModal';

interface MainContentProps {
  selectedServerId: string | null;
  currentUser: AppUser | null;
}

const MainContent: React.FC<MainContentProps> = ({ selectedServerId, currentUser }) => {
  const [trackedUsers, setTrackedUsers] = useState<UserProfile[]>([]);
  const [isRatingModalOpen, setIsRatingModalOpen] = useState(false);
  const [userToRate, setUserToRate] = useState<UserProfile | null>(null);
  const [ratingError, setRatingError] = useState<string | null>(null);

  const [selectedUserForGraph, setSelectedUserForGraph] = useState<UserProfile | null>(null);
  const [graphScoreData, setGraphScoreData] = useState<ScoreEntry[]>([]);
  const [isLoadingGraphData, setIsLoadingGraphData] = useState(false);
  const [graphDataError, setGraphDataError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser) {
      setTrackedUsers([]);
      setIsRatingModalOpen(false);
      setUserToRate(null);
      setRatingError(null);
      setSelectedUserForGraph(null);
      setGraphScoreData([]);
      setGraphDataError(null);
      setIsLoadingGraphData(false);
    }
  }, [currentUser]);

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

  const fetchScoresForGraph = useCallback(async (targetUser: UserProfile) => {
    if (!currentUser) {
      setGraphDataError("Please login to view scores.");
      return;
    }
    setIsLoadingGraphData(true);
    setGraphDataError(null);
    setGraphScoreData([]);

    const actingUserId = currentUser.user_id;
    const targetUserId = targetUser.id;
    const token = localStorage.getItem('app_access_token');

    if (!token) {
      setGraphDataError("Authentication token not found.");
      setIsLoadingGraphData(false);
      return;
    }

    try {
      const response = await fetch(`http://localhost:8000/users/${actingUserId}/credit/given/${targetUserId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) {
        if (response.status === 404) {
          setGraphScoreData([]);
        } else {
          const errorData = await response.json();
          throw new Error(errorData.detail || `Error: ${response.status}`);
        }
      } else {
        const data = await response.json();
        // Convert timestamp strings to numerical timestamps for the graph
        const formattedScores = (data.scores_history || []).map((entry: any) => ({
          ...entry,
          timestamp: new Date(entry.timestamp).getTime(),
        }));
        setGraphScoreData(formattedScores);
      }
    } catch (err: any) {
      console.error("Failed to fetch scores for graph:", err);
      setGraphDataError(err.message || 'Failed to load scores.');
      setGraphScoreData([]);
    } finally {
      setIsLoadingGraphData(false);
    }
  }, [currentUser]);

  const handleViewScores = (targetUser: UserProfile) => {
    setSelectedUserForGraph(targetUser);
    fetchScoresForGraph(targetUser);
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

      if (userToRate && selectedUserForGraph && userToRate.id === selectedUserForGraph.id) {
        fetchScoresForGraph(selectedUserForGraph);
      }

    } catch (err: any) {
      console.error("Failed to submit rating:", err);
      throw err;
    }
  };

  return (
    <div className="main-content-container">
      <UserSearch selectedServerId={selectedServerId} onTrackUser={handleTrackUser} />

      {trackedUsers.length > 0 && (
        <div className="tracked-users-container">
          <h3>Tracked Users:</h3>
          <ul className="tracked-users-list">
            {trackedUsers.map(user => (
              <li key={user.id} className="tracked-user-item">
                <img
                  src={user.avatar_url || 'https://cdn.discordapp.com/embed/avatars/0.png'}
                  alt={`${user.username}'s avatar`}
                  className="tracked-user-avatar"
                />
                <span className="tracked-user-username">{user.username}#{user.discriminator}</span>
                <button onClick={() => handleViewScores(user)} className="view-scores-button" style={{ marginRight: '5px' }}>
                  View Scores
                </button>
                <button onClick={() => openRatingModal(user)} className="add-rating-button">
                  Rate
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isLoadingGraphData && <div className="graph-loading">Loading scores...</div>}
      {graphDataError && <div className="graph-error">Error: {graphDataError}</div>}

      {selectedUserForGraph && !isLoadingGraphData && !graphDataError && (
        <ScoreGraph
          data={graphScoreData}
          graphTitle={`Score History for ${selectedUserForGraph.username}`}
        />
      )}
      {!selectedUserForGraph && !isLoadingGraphData && (
        <ScoreGraph data={[]} graphTitle="Select a user to view their score history" />
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