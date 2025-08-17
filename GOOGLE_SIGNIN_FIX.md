# Google Sign-In CORS Issue Fix

## Problem Summary
You're getting CORS errors when trying to use Google Sign-In because:
1. Missing environment variables for Google Client ID
2. Backend CORS/COOP headers need updating (✅ FIXED)
3. Google Cloud Console configuration may need updating

## Solution Steps

### 🔧 **Step 1: Set Frontend Environment Variables**

1. **Edit the `.env.local` file** in your `frontend` directory:
   ```bash
   # Replace 'your_actual_google_client_id' with your real Google Client ID from Google Cloud Console
   VITE_GOOGLE_CLIENT_ID=your_actual_google_client_id
   VITE_API_BASE_URL=https://payment-tracker-aswa.onrender.com
   ```

2. **Get your Google Client ID:**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Navigate to "APIs & Services" → "Credentials"
   - Find your OAuth 2.0 Client ID
   - Copy the Client ID (it looks like: `123456789-abcdefghijk.apps.googleusercontent.com`)

### 🌐 **Step 2: Update Google Cloud Console Settings**

1. **Go to Google Cloud Console** → "APIs & Services" → "Credentials"
2. **Edit your OAuth 2.0 Client ID**
3. **Add these to Authorized JavaScript origins:**
   - `https://reliable-eclair-abf03c.netlify.app`
   - `http://localhost:5173` (for local development)

4. **Add these to Authorized redirect URIs:**
   - `https://reliable-eclair-abf03c.netlify.app`
   - `http://localhost:5173` (for local development)

### 🔒 **Step 3: Set Backend Environment Variables**

1. **On Render.com** (where your backend is hosted):
   - Go to your backend service settings
   - Add/update environment variable:
     ```
     GOOGLE_CLIENT_ID=your_actual_google_client_id
     ```
   - Use the SAME Client ID as in the frontend

### 🔄 **Step 4: Deploy and Test**

1. **Restart your development server:**
   ```bash
   cd frontend
   npm run dev
   ```

2. **Redeploy your backend** if you changed backend environment variables

3. **Test Google Sign-In:**
   - Open your app
   - Try clicking the Google Sign-In button
   - Check browser console for any remaining errors

### 🐛 **Step 5: Debug (if still not working)**

**Check browser console for:**
```javascript
// Add this to your browser console to debug environment variables
console.log('Google Client ID:', import.meta.env.VITE_GOOGLE_CLIENT_ID)
console.log('API Base URL:', import.meta.env.VITE_API_BASE_URL)
```

**Common issues:**
- ❌ Environment variables not set or wrong format
- ❌ Google Cloud Console domains not matching exactly
- ❌ Client ID mismatch between frontend and backend
- ❌ Browser cache (try incognito/private mode)

### ✅ **Success Indicators**

When working properly, you should see:
- ✅ Google Sign-In button loads without errors
- ✅ Clicking it shows Google's sign-in popup
- ✅ No CORS errors in browser console
- ✅ Successful authentication redirects to dashboard

## Quick Test Commands

```bash
# Test backend connectivity
curl -X GET "https://payment-tracker-aswa.onrender.com/"

# Should return: {"message":"Payment Tracker Backend is running!"}
```

## Need Help?

If you're still getting errors:
1. Share the exact error message from browser console
2. Confirm your Google Client ID is set in both frontend and backend
3. Verify your domain is authorized in Google Cloud Console

---

**Note:** The backend CORS and COOP headers have already been fixed in the previous update.
