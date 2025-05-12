import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import './App.css';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import ServerList from './components/ServerList';
import MainContent from './components/MainContent';
import { UserProfile } from './components/UserSearch';
import UserProfileDisplay from './components/UserProfileDisplay';
import AuthCallbackPage from './components/AuthCallbackPage';
import SettingsModal from './components/SettingsModal';

// Define ServerData interface near AppUser or in a dedicated types file
export interface ServerData {
  id: string;
  name: string;
  icon: string | null;
  trackedUserCount?: number; // Optional: count of users tracked in this server
}

// Define a type for our user state (can be expanded)
export interface AppUser {
  username: string;
  profilePicUrl: string | null; // Can be null if no avatar
  user_id: string; // From Discord
}

export const GLOBAL_VIEW_SERVER_ID = 'global_view_all_tracked';

// Define the new response structure for rated users (matches backend)
interface RatedUserProfileResponse {
  profile: UserProfile;
  current_score: number;
}

// Main layout component
const MainLayout: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [userServers, setUserServers] = useState<ServerData[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(GLOBAL_VIEW_SERVER_ID);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingServers, setIsLoadingServers] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  type LogoutStateType = 'disarmed' | 'armed' | 'disarming-yellow' | 'disarming-green';
  const [logoutState, setLogoutState] = useState<LogoutStateType>('disarmed');
  const [minimumLoadTimePassed, setMinimumLoadTimePassed] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // --- Ref for auto-disarm timer --- ADD THIS
  const logoutArmedTimerRef = useRef<NodeJS.Timeout | null>(null);
  const logoutTransitionTimerRef = useRef<NodeJS.Timeout | null>(null);

  // --- Function to clear timers (moved outside useEffect) --- ADD THIS
  const clearAllLogoutTimers = useCallback(() => {
    if (logoutArmedTimerRef.current) {
      clearTimeout(logoutArmedTimerRef.current);
      logoutArmedTimerRef.current = null;
    }
    if (logoutTransitionTimerRef.current) {
      clearTimeout(logoutTransitionTimerRef.current);
      logoutTransitionTimerRef.current = null;
    }
  }, []); // Empty dependency array because it only uses refs
  // --- End function to clear timers ---

  // --- State for rated users data (replaces trackedUsers) --- 
  const [ratedUsersData, setRatedUsersData] = useState<RatedUserProfileResponse[]>([]);
  const [isLoadingRatedUsers, setIsLoadingRatedUsers] = useState(false);
  const [ratedUsersError, setRatedUsersError] = useState<string | null>(null);
  // --- End state for rated users data ---

  // Refs for click-outside logic
  const profileAreaRef = React.useRef<HTMLDivElement>(null); // For the .user-actions-area

  const fetchUserServers = useCallback(async (token: string) => {
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
  }, []);

  // --- Updated fetchRatedUsersData function --- 
  const fetchRatedUsersData = useCallback(async () => {
    if (!currentUser) {
      setRatedUsersData([]);
      return;
    }
    setIsLoadingRatedUsers(true);
    setRatedUsersError(null);
    const token = localStorage.getItem('app_access_token');
    if (!token) {
      setRatedUsersError("Authentication token not found.");
      setIsLoadingRatedUsers(false);
      return;
    }
    try {
      // Fetch from the updated endpoint, expecting RatedUserProfileResponse[]
      const response = await fetch(`http://localhost:8000/users/${currentUser.user_id}/rated-users`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `Error: ${response.status}`);
      }
      const usersData: RatedUserProfileResponse[] = await response.json();
      setRatedUsersData(usersData);
    } catch (err: any) {
      console.error("Error fetching rated users data:", err);
      setRatedUsersError(err.message || "Failed to fetch rated users data.");
      setRatedUsersData([]);
    } finally {
      setIsLoadingRatedUsers(false);
    }
  }, [currentUser?.user_id]);
  // --- End updated fetchRatedUsersData ---

  const fetchCurrentUser = useCallback(async (token: string) => {
    // console.log("APP: fetchCurrentUser called with token:", token);
    setIsLoadingAuth(true);
    try {
      const response = await fetch('http://localhost:8000/users/me', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      // console.log("APP: fetchCurrentUser response status:", response.status);
      if (response.ok) {
        const backendUserData = await response.json(); // Data from backend
        // console.log("APP: fetchCurrentUser success, user data:", backendUserData);
        setCurrentUser({ // Explicitly map to AppUser interface
          username: backendUserData.username,
          profilePicUrl: backendUserData.profile_picture_url, // Map snake_case to camelCase
          user_id: backendUserData.user_id,
        });
        fetchUserServers(token);
      } else {
        // console.error("APP: Failed to fetch current user, status:", response.status);
        localStorage.removeItem('app_access_token');
        setCurrentUser(null);
        setUserServers([]);
        setServerError(null);
        setSelectedServerId(GLOBAL_VIEW_SERVER_ID);
        setLogoutState('disarmed');
        setIsLoggingOut(false);
      }
    } catch (error) {
      console.error("Error fetching current user:", error);
      localStorage.removeItem('app_access_token');
      setCurrentUser(null);
      setUserServers([]);
      setServerError(null);
      setSelectedServerId(GLOBAL_VIEW_SERVER_ID);
      setLogoutState('disarmed');
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

  // Effect for handling clicks outside & auto-disarm/transition logic
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileAreaRef.current && !profileAreaRef.current.contains(event.target as Node)) {
        if (logoutState === 'armed') {
          console.log("Logout disarmed by click outside (to yellow)");
          clearAllLogoutTimers(); // USE new function
          setLogoutState('disarming-yellow');
        }
      }
    };

    if (logoutState === 'armed') {
      document.addEventListener('mousedown', handleClickOutside);
      clearAllLogoutTimers(); // USE new function
      logoutArmedTimerRef.current = setTimeout(() => {
        console.log("Auto-disarming from armed to yellow after 5s");
        setLogoutState('disarming-yellow');
      }, 5000);
    } else if (logoutState === 'disarming-yellow') {
      document.removeEventListener('mousedown', handleClickOutside);
      clearAllLogoutTimers(); // USE new function
      logoutTransitionTimerRef.current = setTimeout(() => {
        console.log("Transitioning from yellow to green");
        setLogoutState('disarming-green');
      }, 1000);
    } else if (logoutState === 'disarming-green') {
      document.removeEventListener('mousedown', handleClickOutside);
      clearAllLogoutTimers(); // USE new function
      logoutTransitionTimerRef.current = setTimeout(() => {
        console.log("Transitioning from green to disarmed");
        setLogoutState('disarmed');
      }, 1000);
    } else { // 'disarmed' state
      document.removeEventListener('mousedown', handleClickOutside);
      clearAllLogoutTimers(); // USE new function
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      clearAllLogoutTimers(); // USE new function
    };
  }, [logoutState, clearAllLogoutTimers]); // ADD clearAllLogoutTimers to dependencies

  // Effect to fetch rated users data when currentUser changes
  useEffect(() => {
    if (currentUser?.user_id) {
      fetchRatedUsersData();
    } else {
      setRatedUsersData([]); // Clear data if no user
    }
  }, [currentUser?.user_id, fetchRatedUsersData]);

  const handleLogin = () => {
    window.location.href = 'http://localhost:8000/auth/discord/login';
  };

  const handleProfileClick = () => {
    clearAllLogoutTimers(); // USE new function
    if (logoutState === 'armed') {
      handleLogout();
    } else if (logoutState === 'disarmed') {
      setLogoutState('armed');
    } else {
      setLogoutState('armed');
    }
  };

  const handleLogout = () => {
    clearAllLogoutTimers(); // USE new function
    setLogoutState('disarmed');
    setIsLoggingOut(true);
    setTimeout(() => {
      localStorage.removeItem('app_access_token');
      setCurrentUser(null);
      setUserServers([]);
      setServerError(null);
      setSelectedServerId(GLOBAL_VIEW_SERVER_ID);
      setIsLoggingOut(false);
    }, 500);
  };

  const openSettingsModal = () => setIsSettingsModalOpen(true);
  const closeSettingsModal = () => setIsSettingsModalOpen(false);

  // --- Calculate displayedUserServers with counts ---
  const displayedUserServers = React.useMemo(() => {
    const serversWithCounts: ServerData[] = userServers.map(server => {
      if (server.id === GLOBAL_VIEW_SERVER_ID) {
        return { ...server, trackedUserCount: ratedUsersData.length }; // Count based on new data
      }
      let count = 0;
      if (ratedUsersData && ratedUsersData.length > 0) {
        // This server association logic needs review. 
        // DiscordUserProfile (part of RatedUserProfileResponse) has associatedServerIds.
        // We need to check against `item.profile.associatedServerIds`
        ratedUsersData.forEach(item => {
          if (item.profile.associatedServerIds?.includes(server.id)) {
            count++;
          }
        });
      }
      return { ...server, trackedUserCount: count };
    });

    if (!currentUser) {
      return serversWithCounts; // Show all (with potential zero counts) if not logged in but servers were somehow loaded
    }
    // If user is logged in but has no tracked users yet, show all their servers with 0 counts (except global)
    if (ratedUsersData.length === 0 && currentUser) {
      return serversWithCounts;
    }

    const activeServerIds = new Set<string>();
    ratedUsersData.forEach(item => {
      item.profile.associatedServerIds?.forEach((serverId: string) => activeServerIds.add(serverId));
    });

    const filtered = serversWithCounts.filter(server =>
      server.id === GLOBAL_VIEW_SERVER_ID || activeServerIds.has(server.id)
    );

    // Ensure global view is always first if present and sort others if needed
    const globalView = filtered.find(s => s.id === GLOBAL_VIEW_SERVER_ID);
    const otherServers = filtered.filter(s => s.id !== GLOBAL_VIEW_SERVER_ID);
    // Optional: Sort otherServers alphabetically by name, e.g., otherServers.sort((a, b) => a.name.localeCompare(b.name));

    return globalView ? [globalView, ...otherServers] : otherServers;

  }, [userServers, ratedUsersData, currentUser]);
  // --- End Calculate displayedUserServers ---

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
        <div onClick={handleLogin} className="login-icon-button large"> {/* Added 'large' class for styling */}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="48px" height="48px"> {/* Increased size */}
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
          </svg>
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
          servers={displayedUserServers}
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
          <div className="user-actions-area" ref={profileAreaRef}>
            {currentUser ? (
              <>
                <UserProfileDisplay
                  username={currentUser.username}
                  profilePicUrl={currentUser.profilePicUrl || ''}
                  onClick={handleProfileClick}
                  logoutState={logoutState}
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
        key={selectedServerId || 'global'}
        selectedServerId={selectedServerId}
        currentUser={currentUser}
        userServers={displayedUserServers}
        globalViewServerId={GLOBAL_VIEW_SERVER_ID}
        ratedUsersData={ratedUsersData}
        refreshRatedUsersData={fetchRatedUsersData}
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
