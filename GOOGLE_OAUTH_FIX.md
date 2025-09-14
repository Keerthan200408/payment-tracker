# Google OAuth Configuration Fix

## Problem
Getting "Error 400: origin_mismatch" when trying to sign in with Google

## Solution
You need to add your local development URL to Google Cloud Console

### Steps to Fix:

1. **Go to Google Cloud Console:**
   - Visit: https://console.cloud.google.com/apis/credentials
   - Sign in with your Google account

2. **Find Your OAuth 2.0 Client ID:**
   - Look for client ID: `848204323516-3vfl6n39q856502svdkg0420dai34k0k.apps.googleusercontent.com`
   - Click on it to edit

3. **Add Authorized JavaScript Origins:**
   In the "Authorized JavaScript origins" section, add these URLs:
   ```
   http://localhost:5173
   http://127.0.0.1:5173
   ```

4. **For Production (when you deploy):**
   Also add your production URLs:
   ```
   https://your-netlify-app.netlify.app
   https://your-vercel-app.vercel.app
   https://payment-tracker-aswa.onrender.com
   ```

5. **Save Changes**

6. **Wait 5-10 minutes** for Google's changes to propagate

### After Making Changes:
- Clear your browser cache
- Try signing in again
- The Google Sign-In should now work for both local development and production

### Current Environment Variables:
- Local: Uses `http://localhost:5173`
- Production: Uses your deployed domain
- Google Client ID: `848204323516-3vfl6n39q856502svdkg0420dai34k0k.apps.googleusercontent.com`