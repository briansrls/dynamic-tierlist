import React from 'react';

// Define LogoutStateType or import from App.tsx if App.tsx exports it
// For simplicity here, we'll define it directly.
export type LogoutStateType = 'disarmed' | 'armed' | 'disarming-yellow' | 'disarming-green'; // Made exportable and fixed typo

interface UserProfileProps {
  username: string;
  profilePicUrl: string;
  onClick?: () => void;
  // isArmed?: boolean; // REMOVE isArmed
  logoutState?: LogoutStateType; // ADD logoutState prop
}

const UserProfileDisplay: React.FC<UserProfileProps> = ({ username, profilePicUrl, onClick, logoutState }) => {
  const DEFAULT_AVATAR_URL = 'https://cdn.discordapp.com/embed/avatars/0.png';

  let dynamicClassName = "user-profile-display-container";
  if (logoutState === 'armed') {
    dynamicClassName += ' armed';
  } else if (logoutState === 'disarming-yellow') {
    dynamicClassName += ' disarming-yellow';
  } else if (logoutState === 'disarming-green') {
    dynamicClassName += ' disarming-green';
  }

  let title = username;
  if (logoutState === 'armed') {
    title = "Click again to logout";
  } else if (logoutState === 'disarming-yellow' || logoutState === 'disarming-green') {
    title = "Disarming logout...";
  }

  return (
    <div
      className={dynamicClassName}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
      title={title}
    >
      <img
        src={profilePicUrl || DEFAULT_AVATAR_URL}
        alt={`${username}'s profile`}
        className="user-profile-pic"
      />
      {/* Render icon if armed OR in the first stage of disarming (yellow) to allow fade-out */}
      {(logoutState === 'armed' || logoutState === 'disarming-yellow') && (
        <div className="logout-exclamation-icon">!</div>
      )}
    </div>
  );
};

export default UserProfileDisplay; 