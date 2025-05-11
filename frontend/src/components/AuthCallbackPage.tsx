import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// Simple Discord Logo SVG (can be replaced with a more accurate one or an image)
export const DiscordLogoSpinner: React.FC = () => (
  <svg width="80" height="80" viewBox="0 0 24 24" className="discord-spinner-svg">
    {/* Original path commented out for testing */}
    {/* <path fill="#7289DA" d="M20.297 4.555A12.91 12.91 0 0012.748 2c-.222 0-.443.008-.662.016C7.112 2.14 3.494 5.466 2.03 10.028c0 .008-.008.016-.008.024a12.83 12.83 0 001.992 8.13c.056.088.112.168.175.248l.12.16c.08.095.16.183.247.27.112.12.23.232.35.343.128.112.263.215.402.319.112.079.222.15.335.222.142.087.284.167.43.24.112.057.222.103.334.15.15.063.3.12.455.174.12.04.24.07.363.103.15.04.293.07.442.1.12.024.238.04.362.056.175.023.349.03.523.03a12.02 12.02 0 0011.233-12.327c0-.048-.008-.095-.008-.143a12.58 12.58 0 00-2.632-7.92zM8.02 15.082c-.94 0-1.706-.78-1.706-1.736s.766-1.736 1.706-1.736c.963 0 1.73.78 1.73 1.736 0 .956-.767 1.736-1.73 1.736zm7.952 0c-.94 0-1.706-.78-1.706-1.736s.766-1.736 1.706-1.736c.963 0 1.73.78 1.73 1.736-.008.956-.775 1.736-1.73 1.736z" /> */}
    <circle cx="12" cy="12" r="12" fill="#7289DA" /> {/* Changed r to 12 to fill viewBox */}
  </svg>
);

const AuthCallbackPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  // Removed token and error states as we redirect quickly

  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    const receivedToken = queryParams.get('token');

    if (receivedToken) {
      localStorage.setItem('app_access_token', receivedToken);
      console.log("Token received and stored on callback:", receivedToken);
      // Redirect immediately to home page
      // The main app layout will handle fetching user data using this token
      navigate('/');
    } else {
      console.error('Auth callback called without a token.');
      // Redirect to home if no token, maybe with an error query param in future
      navigate('/');
    }
    // No dependencies needed if we redirect immediately, 
    // but location & navigate are safe to include if ESLint complains.
  }, [location, navigate]);

  // Display a loading state with the spinner
  return (
    <div className="auth-callback-page">
      <DiscordLogoSpinner />
      {/* Optional: <p>Logging you in...</p> */}
    </div>
  );
};

export default AuthCallbackPage; 