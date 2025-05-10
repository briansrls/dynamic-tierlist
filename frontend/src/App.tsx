import React from 'react';
import './App.css';
import ServerList from './components/ServerList';
import MainContent from './components/MainContent';
import UserProfileDisplay from './components/UserProfileDisplay';

// Mock current user data
const currentLoggedInUser = {
  username: "stinky cat9",
  profilePicUrl: "/images/sc9.png" // Assuming you will add sc9.png to public/images/
};

function App() {
  return (
    <div className="App">
      <div className="sidebar-container">
        <ServerList />
        <UserProfileDisplay
          username={currentLoggedInUser.username}
          profilePicUrl={currentLoggedInUser.profilePicUrl}
        />
      </div>
      <MainContent />
    </div>
  );
}

export default App;
