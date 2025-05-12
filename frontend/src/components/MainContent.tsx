import React, { useState, useEffect } from 'react';
import ScoreGraph from './ScoreGraph';
import UserSearch, { UserProfile } from './UserSearch';
import { AppUser } from '../App';

interface MainContentProps {
  selectedServerId: string | null;
  currentUser: AppUser | null;
}

const MainContent: React.FC<MainContentProps> = ({ selectedServerId, currentUser }) => {
  const [trackedUsers, setTrackedUsers] = useState<UserProfile[]>([]);

  useEffect(() => {
    if (!currentUser) {
      setTrackedUsers([]);
    }
  }, [currentUser]);

  const handleTrackUser = (userToTrack: UserProfile) => {
    setTrackedUsers(prevTrackedUsers => {
      // Check if user is already tracked
      if (prevTrackedUsers.find(user => user.id === userToTrack.id)) {
        return prevTrackedUsers; // Already tracked, return current list
      }
      return [...prevTrackedUsers, userToTrack]; // Add new user
    });
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
                {/* Placeholder for future "Add Rating" button */}
                <button onClick={() => console.log('TODO: Add rating for', user.username)} className="add-rating-button">
                  Add Rating
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ScoreGraph data={[]} />
      {/* Other content for the main area can go here in the future */}
    </div>
  );
};

export default MainContent; 