import React from 'react';

interface UserProfileProps {
  username: string;
  profilePicUrl: string;
}

const UserProfileDisplay: React.FC<UserProfileProps> = ({ username, profilePicUrl }) => {
  return (
    <div className="user-profile-display-container">
      <img src={profilePicUrl} alt={`${username}'s profile`} className="user-profile-pic" />
      {/* <span className="user-profile-name">{username}</span> */}
      {/* Username display is optional, could be on hover or not shown if pic is enough */}
    </div>
  );
};

export default UserProfileDisplay; 