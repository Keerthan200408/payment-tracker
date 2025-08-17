// Debug script to check environment variables and Google Sign-In setup
console.log('=== Environment Variables Check ===');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('VITE_GOOGLE_CLIENT_ID:', process.env.VITE_GOOGLE_CLIENT_ID ? 'SET (' + process.env.VITE_GOOGLE_CLIENT_ID.substring(0, 20) + '...)' : 'NOT SET');
console.log('VITE_API_BASE_URL:', process.env.VITE_API_BASE_URL || 'NOT SET');

// Check if running in browser environment
if (typeof window !== 'undefined') {
  console.log('\n=== Browser Environment ===');
  console.log('import.meta.env.VITE_GOOGLE_CLIENT_ID:', import.meta?.env?.VITE_GOOGLE_CLIENT_ID ? 'SET' : 'NOT SET');
  console.log('import.meta.env.VITE_API_BASE_URL:', import.meta?.env?.VITE_API_BASE_URL || 'NOT SET');
  
  // Check Google APIs availability
  console.log('window.google:', typeof window.google);
  console.log('Google Sign-In loaded:', !!(window.google?.accounts?.id));
}

console.log('\n=== Instructions ===');
console.log('1. Create a .env.local file in the frontend directory');
console.log('2. Add your Google Client ID: VITE_GOOGLE_CLIENT_ID=your_actual_client_id');
console.log('3. Restart your development server');
console.log('4. Make sure your domain is authorized in Google Cloud Console');
