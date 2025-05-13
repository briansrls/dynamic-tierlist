import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import UserSearch, { UserProfile } from './UserSearch';
import { AppUser, ServerData, GLOBAL_VIEW_SERVER_ID } from '../App';
import AddRatingModal from './AddRatingModal';
import ConfirmationModal from './ConfirmationModal';

// Define the new expected data structure (matching backend's RatedUserProfileResponse)
// (Alternatively, define in App.tsx or types file and import here)
interface RatedUserProfileResponse {
  profile: UserProfile; // Re-uses the existing UserProfile interface
  current_score: number;
}

// Define the type for users with tiers, used internally
type Tier = 'S' | 'A' | 'B' | 'C' | 'D';
interface UserWithTier extends RatedUserProfileResponse {
  tier: Tier;
}

interface MainContentProps {
  selectedServerId: string | null;
  currentUser: AppUser | null;
  userServers: ServerData[];
  globalViewServerId: string;
  ratedUsersData: RatedUserProfileResponse[];
  refreshRatedUsersData: () => Promise<void>;
}

const MainContent: React.FC<MainContentProps> = ({ selectedServerId, currentUser, userServers, globalViewServerId, ratedUsersData, refreshRatedUsersData }) => {
  const [isRatingModalOpen, setIsRatingModalOpen] = useState(false);
  const [userToRate, setUserToRate] = useState<UserProfile | null>(null);
  const [ratingError, setRatingError] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isUntrackConfirmModalOpen, setIsUntrackConfirmModalOpen] = useState(false);
  const [userToUntrack, setUserToUntrack] = useState<UserProfile | null>(null);

  // State for tracking tier changes and animations
  const [animatingUserIds, setAnimatingUserIds] = useState<Set<string>>(new Set());
  const [ratingUpdateCount, setRatingUpdateCount] = useState<number>(0); // New state for global animation trigger

  // --- displayedRatedUsers memo now includes tier calculation ---
  const displayedRatedUsers = useMemo<UserWithTier[]>(() => {
    let usersToDisplay = ratedUsersData;
    if (selectedServerId && selectedServerId !== globalViewServerId) {
      usersToDisplay = ratedUsersData.filter(ratedUser =>
        ratedUser.profile.associatedServerIds?.includes(selectedServerId)
      );
    }

    // Sort by original score
    const sortedUsers = [...usersToDisplay].sort((a, b) => b.current_score - a.current_score);

    if (sortedUsers.length === 0) {
      return [];
    }

    // REMOVE Mean/StdDev calculations
    // const scores = sortedUsers.map(u => u.current_score);
    // const meanScore = ...;
    // let stdDevScore = ...;
    // console.log(`[TierCalc] For displayed users: Mean = ...`);

    // --- Logarithmic Tier Calculation --- ADD THIS BLOCK
    const signedLog10 = (score: number): number => {
      if (score === 0) return 0;
      return Math.sign(score) * Math.log10(Math.abs(score) + 1);
    };

    const calculateTier = (score: number): Tier => {
      const logScore = signedLog10(score);
      // Tier thresholds based on logScore
      if (logScore >= 3) return 'S'; // ~ score >= 1000
      if (logScore >= 2) return 'A'; // ~ score >= 100
      if (logScore >= 0) return 'B'; // ~ score >= 0
      if (logScore >= -2) return 'C'; // ~ score >= -100
      return 'D'; // ~ score < -100
    };
    // --- End Logarithmic Tier Calculation ---

    const usersWithTiers: UserWithTier[] = sortedUsers.map(user => {
      const tier = calculateTier(user.current_score);
      // Update log to show logScore
      const logScoreVal = signedLog10(user.current_score);
      console.log(`[TierCalc] User: ${user.profile.username}, Score: ${user.current_score}, Log10Score: ${logScoreVal.toFixed(2)}, Tier: ${tier}`);
      return {
        ...user,
        tier: tier
      };
    });

    return usersWithTiers;

  }, [ratedUsersData, selectedServerId, globalViewServerId]);
  // --- END displayedRatedUsers ---

  // Effect to trigger animations for all displayed users when a rating is submitted
  useEffect(() => {
    // Log when the effect runs and the trigger value
    console.log(`Animation effect running. ratingUpdateCount: ${ratingUpdateCount}`);

    // We check ratingUpdateCount > 0 because the effect runs once on mount with count 0
    if (ratingUpdateCount > 0) {
      const allDisplayedUserIds = new Set(displayedRatedUsers.map(u => u.profile.id));
      if (allDisplayedUserIds.size === 0) {
        console.log('No users displayed, skipping animation setting.');
        return; // Don't try to animate if list is empty
      }
      console.log('Applying animation to user IDs:', allDisplayedUserIds);
      setAnimatingUserIds(allDisplayedUserIds);

      const timer = setTimeout(() => {
        console.log('Removing animation class (clearing set).');
        setAnimatingUserIds(new Set()); // Clear all animations
      }, 1000); // Animation duration (matches CSS)

      return () => {
        console.log('Clearing animation timer.');
        clearTimeout(timer);
      }
    }
    else {
      console.log('Animation effect ran, but ratingUpdateCount is 0. No animation triggered.');
    }
  }, [ratingUpdateCount]); // *** REMOVED displayedRatedUsers from dependencies ***

  const handleTrackUser = async (userToTrack: UserProfile) => {
    if (!currentUser || !selectedServerId) return;
    console.log("Track user called - current logic might need review for tier list.");
    try {
      const token = localStorage.getItem('app_access_token');
      if (!token) {
        console.error("No auth token found");
        return;
      }
      // Add a neutral rating (0) to associate the user (ensure they appear)
      await fetch(`http://localhost:8000/users/${currentUser.user_id}/credit/${userToTrack.id}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          score_delta: 0,
          reason: "Initiate Tracking",
        }),
      });
      // Refresh the rated users list using the renamed prop
      await refreshRatedUsersData();
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
      setIsSubmitting(false);
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
      setRatingUpdateCount(count => count + 1); // Increment to trigger animation effect
      await refreshRatedUsersData(); // This refreshes data, displayedRatedUsers will update

    } catch (err: any) {
      console.error("Failed to submit rating:", err);
      setIsSubmitting(false);
      throw err;
    }
    // Removed finally block here, isSubmitting is set after catch or successful try
    setIsSubmitting(false);
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

      // Refresh the rated users list using renamed prop
      await refreshRatedUsersData();
      console.log(`Untracked user: ${userBeingUntracked.username}`);

    } catch (error) {
      console.error("Error during untrack operation:", error);
      alert("An unexpected error occurred while untracking the user.");
    } finally {
      setIsSubmitting(false);
      handleCloseUntrackConfirmModal();
    }
  };

  return (
    <div className="main-content-container">
      <div className="tracked-users-container">
        <h3>Tier List</h3>
        {displayedRatedUsers.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#8e9297' }}>No users being tracked yet.</p>
        ) : (
          <ul className="tracked-users-list">
            {displayedRatedUsers.map((ratedUser) => {
              const user = ratedUser.profile;
              const isAnimating = animatingUserIds.has(user.id);
              // Log the animation status during render
              console.log(`Rendering user ${user.id} (${user.username}), isAnimating: ${isAnimating}`);

              const displayedServerIcons = (user.associatedServerIds || [])
                .map(serverId => userServers.find(s => s.id === serverId))
                .filter(server => !!server) as ServerData[];

              return (
                <li key={user.id} className={`tracked-user-item`}>
                  <span className={[
                    'tier-badge',
                    `tier-${ratedUser.tier.toLowerCase()}`,
                    isAnimating ? 'tier-glitch' : ''
                  ].filter(Boolean).join(' ')}
                    style={{ marginRight: '8px', fontWeight: 'bold', minWidth: '18px', textAlign: 'center' }}>
                    {ratedUser.tier}
                  </span>
                  <img
                    src={user.avatar_url || 'https://cdn.discordapp.com/embed/avatars/0.png'}
                    alt={`${user.username}'s avatar`}
                    className="tracked-user-avatar"
                  />
                  <span className="tracked-user-username">{user.username}#{user.discriminator}</span>

                  <div className="tracked-user-server-icons" style={{ display: 'flex', alignItems: 'center' }}>
                    {displayedServerIcons.map(server => (
                      <span key={server.id} className="server-icon-display" title={server.name} style={{ width: '20px', height: '20px', fontSize: '10px' }}>
                        {server.icon ? (
                          <img src={`https://cdn.discordapp.com/icons/${server.id}/${server.icon}.png?size=20`} alt={server.name} />
                        ) : (
                          <span className="server-initials-placeholder">{server.name.charAt(0).toUpperCase()}</span>
                        )}
                      </span>
                    ))}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto' }}>
                    <span style={{ marginRight: '15px', fontWeight: 'bold', fontSize: '0.9em' }}>
                      {ratedUser.current_score.toFixed(1)}
                    </span>
                    <div className="tracked-user-actions" style={{ marginTop: '0px' }}>
                      <button onClick={() => openRatingModal(user)} className="add-rating-button" disabled={isSubmitting} style={{ padding: '3px 6px', fontSize: '0.8em' }}>Rate</button>
                      <button onClick={() => handleOpenUntrackConfirmModal(user)} className="untrack-user-button icon-button" disabled={isSubmitting} title={`Stop tracking ${user.username}`} style={{ padding: '3px' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="12px" height="12px"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></svg>
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

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
          message={<>Are you sure you want to stop tracking <strong>{userToUntrack.username}#{userToUntrack.discriminator}</strong>? Their score (from your perspective) will be cleared.</>}
          confirmButtonText="Untrack"
        />
      )}
    </div>
  );
};

export default MainContent; 