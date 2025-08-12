import { useState, useEffect, useRef, useCallback } from 'react';
import { authAPI, handleAPIError } from '../utils/api';

const SignInPage = ({ setSessionToken, setCurrentUser, setPage, fetchClients, fetchPayments }) => {
  const [isSignup, setIsSignup] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [googleEmail, setGoogleEmail] = useState('');
  const [chosenUsername, setChosenUsername] = useState('');
  const buttonRef = useRef(null);

  const handleLogin = async (loginUsername, loginPassword) => {
    if (!loginUsername || !loginPassword) {
      setError('Username and password are required.');
      return;
    }
    setError('');
    setIsLoading(true);
    try {
      const response = await authAPI.login({
        username: loginUsername,
        password: loginPassword,
      });
      
      const { username, sessionToken } = response.data;
      setCurrentUser(username);
      setSessionToken(sessionToken);
      localStorage.setItem('currentUser', username);
      localStorage.setItem('sessionToken', sessionToken);
      
      if (fetchClients && fetchPayments) {
        await Promise.all([
          fetchClients(sessionToken),
          fetchPayments(sessionToken, new Date().getFullYear().toString())
        ]);
      }
      
      setPage('home');
    } catch (error) {
      handleAPIError(error, setError);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async () => {
    if (!username || !password) {
      setError('All fields are required.');
      return;
    }
    if (username.length < 3 || username.length > 50) {
      setError('Username must be between 3 and 50 characters.');
      return;
    }
    setError('');
    setIsLoading(true);
    try {
      await authAPI.signup({
        username,
        password,
      });
      alert('Account created successfully! Your personalized data sheets have been set up.');
      await handleLogin(username, password);
    } catch (error) {
      handleAPIError(error, setError);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = useCallback(async (response) => {
    try {
      setIsLoading(true);
      setError('');
      
      // Send Google token to backend
      const googleResponse = await authAPI.googleSignIn({
        googleToken: response.credential,
      });

      if (googleResponse.data.needsUsername) {
        const userInfo = JSON.parse(atob(response.credential.split('.')[1]));
        setGoogleEmail(userInfo.email);
        setChosenUsername(userInfo.email.split('@')[0]);
        setShowUsernameModal(true);
      } else {
        const { username, sessionToken } = googleResponse.data;
        setCurrentUser(username);
        setSessionToken(sessionToken);
        localStorage.setItem('currentUser', username);
        localStorage.setItem('sessionToken', sessionToken);
        
        if (fetchClients && fetchPayments) {
          await Promise.all([
            fetchClients(sessionToken),
            fetchPayments(sessionToken, new Date().getFullYear().toString())
          ]);
        }
        
        setPage('home');
      }
    } catch (error) {
      handleAPIError(error, setError);
    } finally {
      setIsLoading(false);
    }
  }, [setCurrentUser, setSessionToken, setPage, fetchClients, fetchPayments, setGoogleEmail, setChosenUsername, setShowUsernameModal, setError, setIsLoading]);

  const handleUsernameSubmit = async () => {
    if (!chosenUsername.trim()) {
      setError('Please enter a username.');
      return;
    }
    if (chosenUsername.length < 3 || chosenUsername.length > 50) {
      setError('Username must be between 3 and 50 characters.');
      return;
    }
    try {
      setIsLoading(true);
      setError('');

      const response = await authAPI.googleSignUp({
        email: googleEmail,
        username: chosenUsername.trim(),
      });

      const { username, sessionToken } = response.data;
      setCurrentUser(username);
      setSessionToken(sessionToken);
      localStorage.setItem('currentUser', username);
      localStorage.setItem('sessionToken', sessionToken);
      
      if (fetchClients && fetchPayments) {
        await Promise.all([
          fetchClients(sessionToken),
          fetchPayments(sessionToken, new Date().getFullYear().toString())
        ]);
      }
      alert('Account created successfully! Your personalized data sheets have been set up.');
      setShowUsernameModal(false);
      setPage('home');
    } catch (error) {
      handleAPIError(error, setError);
    } finally {
      setIsLoading(false);
    }
  };
  useEffect(() => {
  const initializeGoogleSignIn = () => {
    if (window.google && buttonRef.current) {
      window.google.accounts.id.initialize({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        callback: handleGoogleSignIn,
        auto_select: false,
        cancel_on_tap_outside: true,
        context: "signin",
        ux_mode: "popup", // Use popup mode to avoid cross-origin issues
      });
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: "outline",
        size: "large",
        width: 300,
      });
      // Prompt for Google Sign-In
      window.google.accounts.id.prompt();
    }
  };

  if (!window.google) {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = initializeGoogleSignIn;
    document.head.appendChild(script);
  } else {
    initializeGoogleSignIn();
  }

  return () => {
    if (window.google) {
      window.google.accounts.id.cancel();
    }
  };
}, [handleGoogleSignIn]);
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="w-full max-w-md p-6 bg-white rounded-lg shadow-md">
        <h2 className="text-2xl font-semibold text-center mb-6">
          {isSignup ? 'Create Account' : 'Welcome Back'}
        </h2>
        
        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-center text-sm">
            {error}
          </div>
        )}

        {/* Google Sign-In Button */}
        <div className="mb-6 flex justify-center">
          <div ref={buttonRef} className="w-full max-w-[300px]"></div>
        </div>

        {/* Divider */}
        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">Or continue with</span>
          </div>
        </div>

        {/* Traditional Form */}
        <div>
          <div className="mb-4">
            <label className="block mb-2 text-sm font-medium text-gray-700" htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              aria-label="Username"
              disabled={isLoading}
            />
          </div>
          
          <div className="mb-6">
            <label className="block mb-2 text-sm font-medium text-gray-700" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              aria-label="Password"
              disabled={isLoading}
            />
          </div>

          <button
            onClick={isSignup ? handleSignup : () => handleLogin(username, password)}
            className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-200 disabled:bg-gray-400 font-medium"
            disabled={isLoading}
          >
            {isLoading ? (isSignup ? 'Creating Account...' : 'Signing In...') : (isSignup ? 'Create Account' : 'Sign In')}
          </button>

          <p className="text-center mt-4 text-sm text-gray-600">
            {isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              onClick={() => { 
                setIsSignup(!isSignup); 
                setError(''); 
                setUsername('');
                setPassword('');
              }}
              className="text-blue-600 hover:text-blue-700 font-medium"
              disabled={isLoading}
            >
              {isSignup ? 'Sign In' : 'Sign Up'}
            </button>
          </p>
        </div>
      </div>

      {/* Username Selection Modal */}
      {showUsernameModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">Choose Your Username</h3>
            <p className="text-sm text-gray-600 mb-4">
              Please choose a username for your account. This will be used for internal operations.
            </p>
            
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">Signing in with: <span className="font-medium">{googleEmail}</span></p>
            </div>

            <div className="mb-4">
              <label className="block mb-2 text-sm font-medium text-gray-700" htmlFor="chosen-username">Username</label>
              <input
                id="chosen-username"
                type="text"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                value={chosenUsername}
                onChange={(e) => setChosenUsername(e.target.value)}
                placeholder="Enter your preferred username"
                aria-label="Preferred Username"
                disabled={isLoading}
              />
            </div>

            {error && (
              <div className="mb-4 p-2 bg-red-100 text-red-700 rounded-lg text-center text-sm">
                {error}
              </div>
            )}

            <div className="flex space-x-3">
              <button
                onClick={() => {
                  setShowUsernameModal(false);
                  setGoogleEmail('');
                  setChosenUsername('');
                  setError('');
                }}
                className="flex-1 py-2 px-4 border border-gray-300 rounded-lg hover:bg-gray-50 transition duration-200"
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleUsernameSubmit}
                className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-200 disabled:bg-gray-400"
                disabled={isLoading}
              >
                {isLoading ? 'Creating...' : 'Continue'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SignInPage;