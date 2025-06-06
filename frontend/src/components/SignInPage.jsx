
import { useState } from 'react';
import axios from 'axios';

const BASE_URL = 'https://payment-tracker-aswa.onrender.com/api';

const SignInPage = ({ setSessionToken, setCurrentUser, setPage }) => {
  const [isSignup, setIsSignup] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [gmailId, setGmailId] = useState('');
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
        timeout: 10000,
        withCredentials: true, // Keep for cookie compatibility
      });
      console.log('Login response:', response.data);
      const { username, sessionToken, gmailId } = response.data;
      setCurrentUser(username);
      setSessionToken(sessionToken);
      localStorage.setItem('currentUser', username);
      localStorage.setItem('sessionToken', sessionToken);
      localStorage.setItem('gmailId', gmailId);
      setPage('home');
    } catch (error) {
      console.error('Login error:', error.response?.data?.error || error.message);
      setError(error.response?.data?.error || 'Error logging in. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async () => {
    if (!username || !password || !gmailId) {
      setError('All fields are required.');
      return;
    }
    const emailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;
    if (!emailRegex.test(gmailId)) {
      setError('Please enter a valid Gmail ID.');
      return;
    }
    setError('');
    setIsLoading(true);
    try {
      await axios.post(`${BASE_URL}/signup`, {
        username,
        password,
        gmailId,
      }, {
        timeout: 10000,
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
    <div className="max-w-md mx-auto mt-20 p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-semibold text-center mb-4">
        {isSignup ? 'Sign Up' : 'Sign In'}
      </h2>
      {error && (
        <div className="mb-4 p-2 bg-red-100 text-red-700 rounded-lg text-center">
          {error}
        </div>
      )}
      {isSignup ? (
        <div>
          <div className="mb-4">
            <label className="block mb-1">Username</label>
            <input
              type="text"
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter Username"
              aria-label="Username"
              disabled={isLoading}
            />
          </div>
          <div className="mb-4">
            <label className="block mb-1">Password</label>
            <input
              type="password"
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter Password"
              aria-label="Password"
              disabled={isLoading}
            />
          </div>
          <div className="mb-4">
            <label className="block mb-1">Gmail ID</label>
            <input
              type="email"
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              value={gmailId}
              onChange={(e) => setGmailId(e.target.value)}
              placeholder="Enter Gmail ID"
              aria-label="Gmail ID"
              disabled={isLoading}
            />
          </div>
          <button
            onClick={handleSignup}
            className="w-full p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-200 disabled:bg-gray-400"
            disabled={isLoading}
          >
            {isLoading ? 'Signing Up...' : 'Sign Up'}
          </button>
          <p className="text-center mt-2">
            Already have an account?{' '}
            <button
              onClick={() => { setIsSignup(false); setError(''); }}
              className="text-blue-600 hover:underline"
              disabled={isLoading}
            >
              Login
            </button>
          </p>
        </div>
      ) : (
        <div>
          <div className="mb-4">
            <label className="block mb-1">Username</label>
            <input
              type="text"
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter Username"
              aria-label="Username"
              disabled={isLoading}
            />
          </div>
          <div className="mb-4">
            <label className="block mb-1">Password</label>
            <input
              type="password"
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter Password"
              aria-label="Password"
              disabled={isLoading}
            />
          </div>
          <button
            onClick={() => handleLogin(username, password)}
            className="w-full p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-200 disabled:bg-gray-400"
            disabled={isLoading}
          >
            {isLoading ? 'Logging In...' : 'Login'}
          </button>
          <p className="text-center mt-2">
            Don't have an account?{' '}
            <button
              onClick={() => { setIsSignup(true); setError(''); }}
              className="text-blue-600 hover:underline"
              disabled={isLoading}
            >
              Sign Up
            </button>
          </p>
        </div>
      )}
    </div>
  );
};

export default SignInPage;