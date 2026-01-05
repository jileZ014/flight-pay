# Flight Pay - Firebase Setup

## Quick Setup Commands

Run these in PowerShell to set up Firebase:

```powershell
# 1. Navigate to your project folder (create it first)
cd C:\Users\YourUsername\Projects
git clone <your-repo> flight-pay
cd flight-pay

# 2. Initialize Firebase in the project
firebase use flight-pay-az

# 3. Enable Firestore (do this in Firebase Console)
# Go to: https://console.firebase.google.com/project/flight-pay-az/firestore
# Click "Create database" -> Start in production mode -> Select region (us-central1)

# 4. Get your Firebase config
# Go to: https://console.firebase.google.com/project/flight-pay-az/settings/general
# Scroll to "Your apps" -> Click "Web" icon -> Register app -> Copy config

# 5. Update .env.local with your Firebase config
```

## Environment Variables Needed

Create `.env.local` in your project root:

```
# Firebase (get these from Firebase Console)
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=flight-pay-az.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=flight-pay-az
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=flight-pay-az.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id

# Square (already configured)
SQUARE_APP_ID=sq0idp-Pd4MFqwuAJS3nfRRXsn7CQ
SQUARE_ACCESS_TOKEN=your-production-token
SQUARE_ENVIRONMENT=production
```

## Deploy to Vercel

```powershell
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel

# Add environment variables in Vercel dashboard
```
