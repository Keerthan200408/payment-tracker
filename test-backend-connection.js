// Test script to verify backend connectivity and CORS setup
const axios = require('axios');

const BASE_URL = 'https://payment-tracker-aswa.onrender.com';

async function testBackendConnection() {
  console.log('Testing backend connectivity...\n');

  try {
    // Test 1: Health check
    console.log('1. Testing health check endpoint...');
    const healthResponse = await axios.get(`${BASE_URL}/`, {
      timeout: 10000
    });
    console.log('✅ Health check successful:', healthResponse.data.message);
  } catch (error) {
    console.log('❌ Health check failed:', error.message);
  }

  try {
    // Test 2: CORS preflight for Google sign-in
    console.log('\n2. Testing CORS preflight for Google sign-in...');
    const corsResponse = await axios.options(`${BASE_URL}/api/google-signin`, {
      headers: {
        'Origin': 'https://reliable-eclair-abf03c.netlify.app',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type'
      },
      timeout: 10000
    });
    console.log('✅ CORS preflight successful');
  } catch (error) {
    console.log('❌ CORS preflight failed:', error.response?.status, error.message);
  }

  try {
    // Test 3: Google sign-in endpoint without token (should return 400)
    console.log('\n3. Testing Google sign-in endpoint...');
    const googleResponse = await axios.post(`${BASE_URL}/api/google-signin`, {}, {
      headers: {
        'Origin': 'https://reliable-eclair-abf03c.netlify.app',
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
  } catch (error) {
    if (error.response?.status === 400) {
      console.log('✅ Google sign-in endpoint accessible (expected 400 for missing token)');
    } else {
      console.log('❌ Google sign-in endpoint failed:', error.response?.status, error.message);
    }
  }

  console.log('\nTest completed!');
}

testBackendConnection().catch(console.error);
