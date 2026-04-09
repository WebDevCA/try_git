# Street Sweeping Reminder - Backend Server

Backend server with Web Push notifications for the Street Sweeping Reminder app.

## Features

- **RESTful API** for schedules, exceptions, and reminders
- **Web Push Notifications** that work even when app is closed
- **SQLite Database** for data persistence
- **Scheduled Jobs** that check every minute and send notifications
- **Device-based identification** (no account required)

## Setup

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Generate VAPID Keys

Web Push requires VAPID keys for authentication:

```bash
npx web-push generate-vapid-keys
```

Copy the output keys.

### 3. Configure Environment Variables

Create a `.env` file:

```bash
cp .env.example .env
```

Edit `.env` and add your VAPID keys:

```env
PORT=3000
VAPID_PUBLIC_KEY=your_public_key_here
VAPID_PRIVATE_KEY=your_private_key_here
CONTACT_EMAIL=your-email@example.com
```

### 4. Run Locally

```bash
npm start
```

Or for development with auto-reload:

```bash
npm run dev
```

The server will start on `http://localhost:3000`

## API Endpoints

All requests require an `X-Device-ID` header with a unique device identifier.

### Push Notifications

- `GET /api/vapid-public-key` - Get VAPID public key for frontend
- `POST /api/subscribe` - Subscribe to push notifications

### Schedules

- `GET /api/schedules` - Get all schedules
- `POST /api/schedules` - Create new schedule
- `DELETE /api/schedules/:id` - Delete schedule

### Exceptions

- `GET /api/exceptions` - Get all exceptions
- `POST /api/exceptions` - Create new exception
- `DELETE /api/exceptions/:id` - Delete exception

### Reminders

- `GET /api/reminders` - Get reminder times
- `PUT /api/reminders` - Update reminder times

## Deployment

### Option 1: Railway (Recommended - Free Tier)

1. Create account at [railway.app](https://railway.app)
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your repository
4. Set root directory to `/backend`
5. Add environment variables in Railway dashboard:
   - `VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `CONTACT_EMAIL`
6. Railway will auto-deploy and give you a URL

### Option 2: Render (Free Tier)

1. Create account at [render.com](https://render.com)
2. Click "New" → "Web Service"
3. Connect your GitHub repository
4. Configure:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. Add environment variables in Render dashboard
6. Deploy

### Option 3: Heroku

```bash
# Install Heroku CLI, then:
heroku create your-app-name
heroku config:set VAPID_PUBLIC_KEY=your_key
heroku config:set VAPID_PRIVATE_KEY=your_key
heroku config:set CONTACT_EMAIL=your_email
git push heroku main
```

### Option 4: VPS (DigitalOcean, Linode, etc.)

1. SSH into your server
2. Install Node.js
3. Clone repository
4. Set up environment variables
5. Use PM2 to run server:

```bash
npm install -g pm2
pm2 start server.js --name street-sweeping
pm2 startup
pm2 save
```

## Database

Uses SQLite stored in `sweeping.db`. The database file is automatically created when the server starts.

**For production**, consider:
- Regular backups of the `.db` file
- Or migrate to PostgreSQL for better scalability

## How Notifications Work

1. **Frontend subscribes** to push notifications and sends subscription to backend
2. **Server stores** the subscription in database
3. **Cron job runs every minute** checking if it's time to send notifications
4. **For each user**, checks if current time matches their reminder times
5. **Sends push notification** via Web Push API
6. **Logs notification** to prevent duplicates

## Security Notes

- Device IDs should be generated randomly on first app load
- VAPID keys must be kept secret
- Consider adding rate limiting for production
- Consider adding authentication for production use

## Troubleshooting

**Notifications not sending?**
- Check VAPID keys are set correctly
- Check server logs for errors
- Verify subscriptions are being saved
- Test with `/health` endpoint

**Database errors?**
- Delete `sweeping.db` and restart (will lose data)
- Check file permissions

**Port already in use?**
- Change PORT in `.env` file
