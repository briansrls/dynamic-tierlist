import React, { useState, useEffect, useCallback } from 'react';
import './App.css';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import ServerList from './components/ServerList';
import MainContent from './components/MainContent';
import UserProfileDisplay from './components/UserProfileDisplay';
import AuthCallbackPage from './components/AuthCallbackPage';
import SettingsModal from './components/SettingsModal';

// Define ServerData interface near AppUser or in a dedicated types file
export interface ServerData {
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

export const GLOBAL_VIEW_SERVER_ID = "global_view";

// Main layout component
const MainLayout: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [userServers, setUserServers] = useState<ServerData[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(GLOBAL_VIEW_SERVER_ID); // Default to global
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingServers, setIsLoadingServers] = useState(false); // Re-enable this state
  const [serverError, setServerError] = useState<string | null>(null); // Re-enable this state
  const [showLogoutPrompt, setShowLogoutPrompt] = useState(false);
  const [minimumLoadTimePassed, setMinimumLoadTimePassed] = useState(false); // New state for min load time
  const [isLoggingOut, setIsLoggingOut] = useState(false); // New state for fade-out
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false); // New state for settings modal

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
        const globalViewServer: ServerData = {
          id: GLOBAL_VIEW_SERVER_ID,
          name: "All Tracked Users",
          icon: "global_icon_placeholder",
        };
        setUserServers([globalViewServer, ...data]);
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
  }, []); // Removed selectedServerId from dependencies, was causing re-fetches

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
        setSelectedServerId(GLOBAL_VIEW_SERVER_ID); // Reset to global on auth failure
        setShowLogoutPrompt(false);
        setIsLoggingOut(false);
      }
    } catch (error) {
      console.error("Error fetching current user:", error);
      localStorage.removeItem('app_access_token');
      setCurrentUser(null);
      setUserServers([]); // Clear servers on error
      setServerError(null); // Clear server errors
      setSelectedServerId(GLOBAL_VIEW_SERVER_ID); // Reset to global on error
      setShowLogoutPrompt(false);
      setIsLoggingOut(false);
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
      setSelectedServerId(GLOBAL_VIEW_SERVER_ID);
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
    setIsLoggingOut(true);
    setTimeout(() => {
      localStorage.removeItem('app_access_token');
      setCurrentUser(null);
      setUserServers([]);
      setServerError(null);
      setSelectedServerId(GLOBAL_VIEW_SERVER_ID); // Reset to global on logout
      setShowLogoutPrompt(false);
      setIsLoggingOut(false);
    }, 500);
  };

  const openSettingsModal = () => setIsSettingsModalOpen(true);
  const closeSettingsModal = () => setIsSettingsModalOpen(false);

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
          <div className="settings-cog-area">
            <button onClick={openSettingsModal} className="icon-button settings-cog-button" title="Settings">
              <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor">
                <path d="M0 0h24v24H0V0z" fill="none" />
                <path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.08-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.08.49 0 .61.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z" />
              </svg>
            </button>
          </div>
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
      <MainContent
        selectedServerId={selectedServerId}
        currentUser={currentUser}
        userServers={userServers}
        globalViewServerId={GLOBAL_VIEW_SERVER_ID}
      />
      {isSettingsModalOpen && (
        <SettingsModal
          isOpen={isSettingsModalOpen}
          onClose={closeSettingsModal}
          currentUser={currentUser}
        />
      )}
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
