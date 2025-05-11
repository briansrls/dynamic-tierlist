import React, { useState, useEffect, useCallback } from 'react';
import './App.css';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import ServerList from './components/ServerList';
import MainContent from './components/MainContent';
import UserProfileDisplay from './components/UserProfileDisplay';
import AuthCallbackPage from './components/AuthCallbackPage';

// Define a type for our user state (can be expanded)
interface AppUser {
  username: string;
  profilePicUrl: string | null; // Can be null if no avatar
  user_id: string; // From Discord
}

// Main layout component
const MainLayout: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [showLogoutPrompt, setShowLogoutPrompt] = useState(false);

  const fetchCurrentUser = useCallback(async (token: string) => {
    console.log("fetchCurrentUser called with token:", token);
    setIsLoadingAuth(true); // Explicitly set loading true at the start
    try {
      const response = await fetch('http://localhost:8000/users/me', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      console.log("fetchCurrentUser response status:", response.status);
      if (response.ok) {
        const userData = await response.json();
        console.log("fetchCurrentUser success, user data:", userData);
        setCurrentUser({
          username: userData.username,
          profilePicUrl: userData.profile_picture_url,
          user_id: userData.user_id,
        });
      } else {
        console.error("Failed to fetch current user, status:", response.status, "Response:", await response.text());
        localStorage.removeItem('app_access_token');
        setCurrentUser(null);
      }
    } catch (error) {
      console.error("Error fetching current user:", error);
      localStorage.removeItem('app_access_token');
      setCurrentUser(null);
    }
    setIsLoadingAuth(false);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('app_access_token');
    if (token) {
      fetchCurrentUser(token);
    } else {
      setIsLoadingAuth(false); // No token, not loading
    }
  }, [fetchCurrentUser]);

  const handleLogin = () => {
    window.location.href = 'http://localhost:8000/auth/discord/login';
  };

  const handleProfileClick = () => {
    setShowLogoutPrompt(prev => !prev);
  };

  const handleLogout = () => {
    localStorage.removeItem('app_access_token');
    setCurrentUser(null);
    setShowLogoutPrompt(false); // Hide the prompt after logout
  };

  if (isLoadingAuth) {
    return <div className="loading-app">Loading Application...</div>; // Or a spinner
  }

  return (
    <div className="App">
      <div className="sidebar-container">
        <ServerList />
        <div className="sidebar-bottom">
          <div className="user-actions-area"> {/* Consistent wrapper for both states */}
            {currentUser ? (
              <>
                {showLogoutPrompt && (
                  <button onClick={handleLogout} className="popup-logout-button">
                    Logout
                  </button>
                )}
                <UserProfileDisplay
                  username={currentUser.username}
                  profilePicUrl={currentUser.profilePicUrl || ''}
                  onClick={handleProfileClick} // This now toggles the prompt
                />
              </>
            ) : (
              <div onClick={handleLogin} className="login-icon-button" title="Login with Discord">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="28px" height="28px">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                </svg>
              </div>
            )}
          </div>
        </div>
      </div>
      <MainContent />
    </div>
  );
};

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/*" element={<MainLayout />} />
      </Routes>
    </Router>
  );
}

export default App;
