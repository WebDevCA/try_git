# Backend Setup Guide

This guide will help you deploy the backend server so your app has reliable push notifications.

## Quick Overview

The backend provides:
- ✅ **Push notifications that work even when app is closed**
- ✅ **Data persistence across devices**
- ✅ **Scheduled notification checks every minute**
- ✅ **No user accounts needed** (device-based)

## Step 1: Generate VAPID Keys

VAPID keys are required for Web Push. Generate them once:

```bash
cd backend
npm install
npx web-push generate-vapid-keys
```

**Save the output!** You'll need both keys.

## Step 2: Deploy to Railway (Easiest - Free Tier)

Railway offers a generous free tier perfect for this app.

### 2.1 Create Railway Account

1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub

### 2.2 Deploy

1. Click **"New Project"**
2. Select **"Deploy from GitHub repo"**
3. Authorize Railway to access your repositories
4. Select **"street-sweeping-app"**
5. Railway will detect the repository

### 2.3 Configure

1. In the deployment settings, set **Root Directory** to `backend`
2. Go to **Variables** tab
3. Add these environment variables:
   ```
   VAPID_PUBLIC_KEY=<your_public_key>
   VAPID_PRIVATE_KEY=<your_private_key>
   CONTACT_EMAIL=your-email@example.com
   ```
4. Click **"Deploy"**

### 2.4 Get Your Backend URL

1. Once deployed, go to **Settings** → **Domains**
2. Click **"Generate Domain"**
3. Copy the URL (something like `https://your-app.up.railway.app`)

## Step 3: Update Frontend

### 3.1 Update API Client

Edit `api-client.js` and replace the backend URL:

```javascript
const API_BASE_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : 'https://YOUR-RAILWAY-URL.railway.app'; // Update this!
```

### 3.2 Update index.html

Add the API client script **before** app.js:

```html
<script src="api-client.js"></script>
<script src="app.js"></script>
```

### 3.3 Commit and Push

```bash
git add .
git commit -m "Configure backend URL"
git push origin main
```

GitHub Pages will update automatically in 1-2 minutes.

## Step 4: Test It!

1. **Open your app** on your phone: `https://webdevca.github.io/street-sweeping-app/`
2. **Grant notification permission** when prompted
3. **Add your schedule**
4. **Check Railway logs** to see if subscription was received:
   - Go to your Railway project
   - Click on the deployment
   - View **Logs** tab
   - You should see "Subscription saved"

## Alternative: Deploy to Render

If you prefer Render over Railway:

1. Go to [render.com](https://render.com)
2. Click **"New"** → **"Web Service"**
3. Connect GitHub and select your repo
4. Configure:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. Add environment variables (same as Railway)
6. Deploy

## Local Testing (Optional)

To test the backend locally before deploying:

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your VAPID keys
npm start
```

Then in another terminal, serve the frontend:

```bash
cd ..  # Back to project root
python3 -m http.server 8000
```

Open `http://localhost:8000` and the app will connect to `http://localhost:3000`

## Troubleshooting

**"VAPID keys not set" error**
- Double-check environment variables in Railway/Render dashboard
- Make sure you generated keys with `npx web-push generate-vapid-keys`

**"Failed to subscribe" error**
- Check browser console for detailed error
- Verify backend URL is correct in `api-client.js`
- Check CORS is enabled (it is by default)

**Notifications not arriving**
- Check Railway/Render logs for errors
- Verify subscription was saved (check logs after granting permission)
- Make sure backend is running (check /health endpoint)

**Database errors**
- Railway/Render provide persistent storage by default
- Database file is created automatically

## Costs

**Railway Free Tier:**
- $5 credit/month
- Enough for ~500 hours of runtime
- Perfect for personal use

**Render Free Tier:**
- 750 hours/month
- Spins down after 15 min inactivity (may delay notifications slightly)

Both are **completely free** for personal use like this app.

## Next Steps

Once deployed and tested:

1. **Set your reminder times** in the app
2. **Add schedule changes** for holidays
3. **Test tomorrow** - you should get notifications even if app is closed!

## Need Help?

Check the backend logs in Railway/Render for error messages. Most issues are:
- VAPID keys not set correctly
- Wrong backend URL in frontend
- Firewall/network blocking Web Push
