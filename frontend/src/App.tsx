import React, { useState, useEffect, useCallback } from 'react';
import './App.css';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import ServerList from './components/ServerList';
import MainContent from './components/MainContent';
import UserProfileDisplay from './components/UserProfileDisplay';
import AuthCallbackPage from './components/AuthCallbackPage';

// Define ServerData interface near AppUser or in a dedicated types file
interface ServerData {
  id: string;
  name: string;
  icon: string | null;
}

// Define a type for our user state (can be expanded)
export interface AppUser {
  username: string;
  profilePicUrl: string | null; // Can be null if no avatar
  user_id: string; // From Discord
}

// Main layout component
const MainLayout: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [userServers, setUserServers] = useState<ServerData[]>([]); // Re-enable this state
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null); // New state for selected server
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingServers, setIsLoadingServers] = useState(false); // Re-enable this state
  const [serverError, setServerError] = useState<string | null>(null); // Re-enable this state
  const [showLogoutPrompt, setShowLogoutPrompt] = useState(false);
  const [minimumLoadTimePassed, setMinimumLoadTimePassed] = useState(false); // New state for min load time
  const [isLoggingOut, setIsLoggingOut] = useState(false); // New state for fade-out

  // Refs for click-outside logic
  const profileAreaRef = React.useRef<HTMLDivElement>(null); // For the .user-actions-area
  const logoutButtonRef = React.useRef<HTMLButtonElement>(null); // For the .popup-logout-button

  const fetchUserServers = useCallback(async (token: string) => { // Re-enable this function
    setIsLoadingServers(true);
    setServerError(null);
    try {
      const response = await fetch('http://localhost:8000/users/me/tracked-servers', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (response.ok) {
        const data: ServerData[] = await response.json();
        setUserServers(data);
        if (data.length > 0 && !selectedServerId) {
          setSelectedServerId(data[0].id);
        }
      } else {
        const errorText = await response.text();
        console.error("Failed to fetch servers:", response.status, errorText);
        setServerError(`Failed to load servers (Error: ${response.status}).`);
        setUserServers([]);
      }
    } catch (err) {
      console.error("Error fetching servers:", err);
      setServerError("An error occurred while loading your servers.");
      setUserServers([]);
    }
    setIsLoadingServers(false);
  }, []); // Removed selectedServerId from dependencies. Auto-selection logic might need refinement.

  const fetchCurrentUser = useCallback(async (token: string) => {
    console.log("fetchCurrentUser called with token:", token);
    setIsLoadingAuth(true);
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
        fetchUserServers(token); // Re-enable this call
      } else {
        console.error("Failed to fetch current user, status:", response.status, "Response:", await response.text());
        localStorage.removeItem('app_access_token');
        setCurrentUser(null);
        setUserServers([]); // Clear servers on auth failure
        setServerError(null); // Clear server errors
        setSelectedServerId(null); // Clear selected server
      }
    } catch (error) {
      console.error("Error fetching current user:", error);
      localStorage.removeItem('app_access_token');
      setCurrentUser(null);
      setUserServers([]); // Clear servers on error
      setServerError(null); // Clear server errors
      setSelectedServerId(null); // Clear selected server
    }
    setIsLoadingAuth(false);
  }, [fetchUserServers]);

  useEffect(() => {
    const token = localStorage.getItem('app_access_token');
    if (token) {
      fetchCurrentUser(token);
    } else {
      setIsLoadingAuth(false); // No token, not loading auth
      setUserServers([]); // Ensure servers are clear if no token from the start
      setIsLoadingServers(false); // Not loading servers either
      setSelectedServerId(null);
    }

    // Start timer for minimum loading display time - THIS RUNS ONCE ON MOUNT
    const timer = setTimeout(() => {
      setMinimumLoadTimePassed(true);
      console.log("Minimum load time passed."); // For debugging
    }, 1000); // 1 second

    return () => {
      console.log("Cleaning up minimum load time timer."); // For debugging
      clearTimeout(timer);
    };
    // Main dependency is fetchCurrentUser for token logic. 
    // Timer logic is mount-once, so an empty dep array for that part would be fine, 
    // but to avoid complex useEffects, let it run with fetchCurrentUser changes.
    // Better: separate useEffect for the timer.
  }, [fetchCurrentUser]); // fetchCurrentUser dependency is for the token checking logic

  // Let's create a separate useEffect for the mount-once timer to be cleaner
  useEffect(() => {
    console.log("Mount timer effect running");
    const timer = setTimeout(() => {
      setMinimumLoadTimePassed(true);
      console.log("Minimum load time passed (from mount effect).");
    }, 1000);
    return () => {
      console.log("Cleaning up mount timer.");
      clearTimeout(timer);
    };
  }, []); // Empty dependency array makes this run only once on mount and clean up on unmount

  // Effect for handling clicks outside the logout prompt
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // If the logout prompt is shown and the click is outside the user-actions-area (which contains the profile pic and the popup button)
      if (showLogoutPrompt && profileAreaRef.current && !profileAreaRef.current.contains(event.target as Node) && !logoutButtonRef.current?.contains(event.target as Node)) {
        setShowLogoutPrompt(false);
      }
    };

    if (showLogoutPrompt) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showLogoutPrompt]);

  const handleLogin = () => {
    window.location.href = 'http://localhost:8000/auth/discord/login';
  };

  const handleProfileClick = () => {
    setShowLogoutPrompt(prev => !prev);
  };

  const handleLogout = () => {
    setIsLoggingOut(true); // Start fade-out

    // Delay actual logout logic to allow animation to play
    setTimeout(() => {
      localStorage.removeItem('app_access_token');
      setCurrentUser(null); // This will trigger re-render to login screen
      setUserServers([]);
      setServerError(null);
      setSelectedServerId(null);
      setShowLogoutPrompt(false);
      setIsLoggingOut(false); // Reset fade-out state
      // Tracked users in MainContent will clear via its own useEffect watching currentUser
    }, 500); // Match this duration to your CSS fade-out animation time
  };

  // 1. Initial Loading Phase (Auth check or minimum display time not passed)
  if (isLoadingAuth || !minimumLoadTimePassed) {
    return (
      <div className="loading-app">
        <div className="css-spinner"></div>
      </div>
    );
  }

  // 2. Post-Loading, User Logged Out: Show Login Screen
  if (!currentUser) { // isLoadingAuth is false, minimumLoadTimePassed is true
    return (
      <div className="login-screen-container">
        <div className="login-prompt">
          {/* Optional: Add a logo or app name here */}
          <h2>Welcome to Social Credit Tracker</h2>
          <p>Please log in with Discord to continue.</p>
          <div onClick={handleLogin} className="login-icon-button large"> {/* Added 'large' class for styling */}
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="48px" height="48px"> {/* Increased size */}
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
            </svg>
          </div>
        </div>
      </div>
    );
  }

  // 3. Post-Loading, User Logged In, Servers Loading (currentUser is not null here)
  if (isLoadingServers) { // isLoadingAuth is false, minimumLoadTimePassed is true, currentUser exists
    return (
      <div className="loading-app">
        <div className="css-spinner"></div>
      </div>
    );
  }

  // 4. Post-Loading, User Logged In, Servers Loaded: Show Main App Layout
  // (isLoadingAuth is false, minimumLoadTimePassed is true, currentUser exists, isLoadingServers is false)
  return (
    <div className={`App ${isLoggingOut ? 'app-fading-out' : 'app-loaded'}`}> {/* Conditionally add fading-out class */}
      <div className="sidebar-container">
        <ServerList
          servers={userServers}
          isLoading={isLoadingServers}
          error={serverError}
          selectedServerId={selectedServerId}
          onSelectServer={setSelectedServerId}
        />
        <div className="sidebar-bottom">
          <div className="user-actions-area" ref={profileAreaRef}> {/* Assign ref to the wrapper */}
            {currentUser ? (
              <>
                {showLogoutPrompt && (
                  <button
                    onClick={handleLogout}
                    className="popup-logout-button"
                    ref={logoutButtonRef} // Assign ref to the button
                  >
                    Logout
                  </button>
                )}
                <UserProfileDisplay
                  username={currentUser.username}
                  profilePicUrl={currentUser.profilePicUrl || ''}
                  onClick={handleProfileClick}
                />
              </>
            ) : (
              <div onClick={handleLogin} className="login-icon-button">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="28px" height="28px">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                </svg>
              </div>
            )}
          </div>
        </div>
      </div>
      <MainContent selectedServerId={selectedServerId} currentUser={currentUser} />
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
