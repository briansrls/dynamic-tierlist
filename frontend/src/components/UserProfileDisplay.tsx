import React from 'react';

interface UserProfileProps {
  username: string;
  profilePicUrl: string;
  onClick?: () => void;
}

const UserProfileDisplay: React.FC<UserProfileProps> = ({ username, profilePicUrl, onClick }) => {
  return (
    <div
      className="user-profile-display-container"
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <img src={profilePicUrl} alt={`${username}'s profile`} className="user-profile-pic" />
      {/* <span className="user-profile-name">{username}</span> */}
      {/* Username display is optional, could be on hover or not shown if pic is enough */}
    </div>
  );
};

export default UserProfileDisplay; 