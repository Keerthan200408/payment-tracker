
import { useState, useEffect } from 'react';
import axios from 'axios';

const BASE_URL = 'https://payment-tracker-aswa.onrender.com/api';

const SignInPage = ({ setSessionToken, setCurrentUser, setPage }) => {
  const [isSignup, setIsSignup] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  // const [gmailId, setGmailId] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (loginUsername, loginPassword) => {
    if (!loginUsername || !loginPassword) {
      setError('Username and password are required.');
      return;
    }
    setError('');
    setIsLoading(true);
    try {
      const response = await axios.post(`${BASE_URL}/login`, {
        username: loginUsername,
        password: loginPassword,
      }, {
        timeout: 20000,
        withCredentials: true, // Keep for cookie compatibility
      });
      console.log('Login response:', response.data);
      const { username, sessionToken } = response.data;
      setCurrentUser(username);
      setSessionToken(sessionToken);
      localStorage.setItem('currentUser', username);
      localStorage.setItem('sessionToken', sessionToken);
      await Promise.all([
  fetchClients(sessionToken),
  fetchPayments(sessionToken, new Date().getFullYear().toString())
]);
    setPage('home');
    // Refresh the page after 3 seconds
    setTimeout(() => {
      window.location.reload();
    }, 3000);
    } catch (error) {
      console.error('Login error:', error.response?.data?.error || error.message);
      setError(error.response?.data?.error || 'Error logging in. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async () => {
    if (!username || !password) {
      setError('All fields are required.');
      return;
    }
    setError('');
    setIsLoading(true);
    try {
      await axios.post(`${BASE_URL}/signup`, {
        username,
        password,
      }, {
        timeout: 20000,
        withCredentials: true,
      });
      console.log('Signup successful, attempting login');
      await handleLogin(username, password);
    } catch (error) {
      console.error('Signup error:', error.response?.data?.error || error.message);
      setError(error.response?.data?.error || 'Error signing up. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="w-full sm:max-w-md p-4 sm:p-6 bg-white rounded-lg shadow-md">
        <h2 className="text-2xl font-semibold text-center mb-4">
          {isSignup ? 'Sign Up' : 'Sign In'}
        </h2>
        {error && (
          <div className="mb-4 p-2 bg-red-100 text-red-700 rounded-lg text-center text-sm sm:text-base">
            {error}
          </div>
        )}
        {isSignup ? (
          <div>
            <div className="mb-4">
              <label className="block mb-1 text-sm sm:text-base">Username</label>
              <input
                type="text"
                className="w-full p-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm sm:text-base"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter Username"
                aria-label="Username"
                disabled={isLoading}
              />
            </div>
            <div className="mb-4">
              <label className="block mb-1 text-sm sm:text-base">Password</label>
              <input
                type="password"
                className="w-full p-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm sm:text-base"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter Password"
                aria-label="Password"
                disabled={isLoading}
              />
            </div>
            {/* <div className="mb-4">
              <label className="block mb-1 text-sm sm:text-base">Gmail ID</label>
              <input
                type="email"
                className="w-full p-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm sm:text-base"
                value={gmailId}
                onChange={(e) => setGmailId(e.target.value)}
                placeholder="Enter Gmail ID"
                aria-label="Gmail ID"
                disabled={isLoading}
              />
            </div> */}
            <button
              onClick={handleSignup}
              className="w-full px-3 py-1.5 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition duration-200 disabled:bg-gray-400"
              disabled={isLoading}
            >
              {isLoading ? 'Signing Up...' : 'Sign Up'}
            </button>
            <p className="text-center mt-2 text-sm sm:text-base">
              Already have an account?{' '}
              <button
                onClick={() => { setIsSignup(false); setError(''); }}
                className="text-blue-500 hover:underline"
                disabled={isLoading}
              >
                Login
              </button>
            </p>
          </div>
        ) : (
          <div>
            <div className="mb-4">
              <label className="block mb-1 text-sm sm:text-base">Username</label>
              <input
                type="text"
                className="w-full p-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm sm:text-base"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter Username"
                aria-label="Username"
                disabled={isLoading}
              />
            </div>
            <div className="mb-4">
              <label className="block mb-1 text-sm sm:text-base">Password</label>
              <input
                type="password"
                className="w-full p-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm sm:text-base"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter Password"
                aria-label="Password"
                disabled={isLoading}
              />
            </div>
            <button
              onClick={() => handleLogin(username, password)}
              className="w-full px-3 py-1.5 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition duration-200 disabled:bg-gray-400"
              disabled={isLoading}
            >
              {isLoading ? 'Logging In...' : 'Login'}
            </button>
            <p className="text-center mt-2 text-sm sm:text-base">
              Don't have an account?{' '}
              <button
                onClick={() => { setIsSignup(true); setError(''); }}
                className="text-blue-500 hover:underline"
                disabled={isLoading}
              >
                Sign Up
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SignInPage;