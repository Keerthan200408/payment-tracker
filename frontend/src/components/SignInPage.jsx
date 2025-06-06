import { useState } from 'react';
import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

const SignInPage = ({ setSessionToken, setCurrentUser, setPage }) => {
  const [isSignup, setIsSignup] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [gmailId, setGmailId] = useState('');

  const handleLogin = async () => {
    if (!username || !password) {
      alert('Username and password are required.');
      return;
    }
    try {
      const response = await axios.post(`${BASE_URL}/api/login`, { username, password }, {
        timeout: 20000,
        withCredentials: true,
      });
      setCurrentUser(response.data.username);
      setSessionToken(response.data.sessionToken);
      localStorage.setItem('currentUser', response.data.username);
      localStorage.setItem('sessionToken', response.data.sessionToken);
      setPage('home');
    } catch (error) {
      console.error('Login error:', error);
      alert(error.response?.data?.error || `Error logging in: ${error.message}`);
    }
  };

  const handleSignup = async () => {
    if (!username || !password || !gmailId) {
      alert('All fields are required.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(gmailId) || !gmailId.endsWith('@gmail.com')) {
      alert('Please enter a valid Gmail ID.');
      return;
    }
    try {
      await axios.post(`${BASE_URL}/api/signup`, { username, password, gmailId }, {
        timeout: 20000,
        withCredentials: true,
      });
      alert('Account created successfully! Please login.');
      setIsSignup(false);
      setUsername('');
      setPassword('');
      setGmailId('');
    } catch (error) {
      console.error('Signup error:', error);
      alert(error.response?.data?.error || `Error signing up: ${error.message}`);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-20 p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-semibold text-center mb-4">
        {isSignup ? 'Sign Up' : 'Sign In'}
      </h2>
      {isSignup ? (
        <div>
          <div className="mb-4">
            <label className="block mb-1">Username</label>
            <input
              type="text"
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              aria-label="Username"
            />
          </div>
          <div className="mb-4">
            <label className="block mb-1">Password</label>
            <input
              type="password"
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              aria-label="Password"
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
            />
          </div>
          <button
            onClick={handleSignup}
            className="w-full bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 transition duration-200"
          >
            Sign Up
          </button>
          <p className="text-center mt-2">
            Already have an account?{' '}
            <button
              onClick={() => setIsSignup(false)}
              className="text-blue-600 hover:underline"
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
              placeholder="Enter username"
              aria-label="Username"
            />
          </div>
          <div className="mb-4">
            <label className="block mb-1">Password</label>
            <input
              type="password"
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              aria-label="Password"
            />
          </div>
          <button
            onClick={handleLogin}
            className="w-full bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 transition duration-200"
          >
            Login
          </button>
          <p className="text-center mt-2">
            Don't have an account?{' '}
            <button
              onClick={() => setIsSignup(true)}
              className="text-blue-600 hover:underline"
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