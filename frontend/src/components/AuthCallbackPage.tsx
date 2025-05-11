import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const AuthCallbackPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    const receivedToken = queryParams.get('token');

    if (receivedToken) {
      setToken(receivedToken);
      // Store the token in localStorage for persistence across sessions
      localStorage.setItem('app_access_token', receivedToken);

      // TODO: Fetch user details from a backend /users/me endpoint using this token
      // For now, redirect to home page after a short delay
      console.log("Token received and stored:", receivedToken);
      setTimeout(() => {
        navigate('/'); // Redirect to the main page
      }, 3000); // 3-second delay to see the message
    } else {
      setError('No token found in URL.');
      console.error('Auth callback called without a token.');
      setTimeout(() => {
        navigate('/'); // Redirect to home if no token
      }, 3000);
    }
  }, [location, navigate]);

  if (error) {
    return (
      <div>
        <h1>Authentication Error</h1>
        <p>{error}</p>
        <p>Redirecting to homepage...</p>
      </div>
    );
  }

  if (token) {
    return (
      <div>
        <h1>Login Successful!</h1>
        <p>Your access token has been received and stored.</p>
        {/* <p>Token: {token}</p> */}
        <p>Redirecting to the application...</p>
      </div>
    );
  }

  return (
    <div>
      <h1>Processing Login...</h1>
      <p>Please wait while we finalize your login.</p>
    </div>
  );
};

export default AuthCallbackPage; 