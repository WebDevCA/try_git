const { Pool } = require('pg');

// Create PostgreSQL connection pool using DATABASE_URL from Railway
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize database schema
async function initializeDatabase() {
    const client = await pool.connect();
    try {
        // Users table
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                device_id TEXT UNIQUE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Push subscriptions table
        await client.query(`
            CREATE TABLE IF NOT EXISTS push_subscriptions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                endpoint TEXT NOT NULL,
                p256dh TEXT NOT NULL,
                auth TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE(user_id, endpoint)
            )
        `);

        // Schedules table
        await client.query(`
            CREATE TABLE IF NOT EXISTS schedules (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                label TEXT,
                day_of_week INTEGER NOT NULL,
                week_pattern TEXT NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                active INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // Exceptions table
        await client.query(`
            CREATE TABLE IF NOT EXISTS exceptions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                date TEXT NOT NULL,
                moved_to_date TEXT,
                reason TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // Reminders table
        await client.query(`
            CREATE TABLE IF NOT EXISTS reminders (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL UNIQUE,
                night_before TEXT DEFAULT '20:00',
                morning_of TEXT DEFAULT '07:00',
                timezone TEXT DEFAULT 'UTC',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        
        // Add timezone column to existing reminders tables that predate this column
        await client.query(`
            ALTER TABLE reminders ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC'
        `);

        // Notification log
        await client.query(`
            CREATE TABLE IF NOT EXISTS notification_log (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                notification_type TEXT NOT NULL,
                sweeping_date TEXT NOT NULL,
                sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE(user_id, notification_type, sweeping_date)
            )
        `);

        console.log('Database initialized successfully');
    } finally {
        client.release();
    }
}

// Get or create user by device ID
async function getOrCreateUser(deviceId) {
    const client = await pool.connect();
    try {
        let result = await client.query('SELECT * FROM users WHERE device_id = $1', [deviceId]);

        if (result.rows.length === 0) {
            result = await client.query(
                'INSERT INTO users (device_id) VALUES ($1) RETURNING *',
                [deviceId]
            );
        }

        return result.rows[0];
    } finally {
        client.release();
    }
}

// Push subscription methods
async function savePushSubscription(userId, subscription) {
    const client = await pool.connect();
    try {
        await client.query(`
            INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (user_id, endpoint) DO UPDATE SET
                p256dh = EXCLUDED.p256dh,
                auth = EXCLUDED.auth
        `, [userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth]);
    } finally {
        client.release();
    }
}

async function getPushSubscriptions(userId) {
    const result = await pool.query('SELECT * FROM push_subscriptions WHERE user_id = $1', [userId]);
    return result.rows;
}

async function deletePushSubscription(endpoint) {
    await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
}

// Schedule methods
async function getSchedules(userId) {
    const result = await pool.query('SELECT * FROM schedules WHERE user_id = $1 ORDER BY id', [userId]);
    return result.rows;
}

async function createSchedule(userId, schedule) {
    const result = await pool.query(`
        INSERT INTO schedules (user_id, label, day_of_week, week_pattern, start_time, end_time, active)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
    `, [
        userId,
        schedule.label || null,
        schedule.dayOfWeek,
        JSON.stringify(schedule.weekPattern),
        schedule.startTime,
        schedule.endTime,
        schedule.active !== undefined ? (schedule.active ? 1 : 0) : 1
    ]);

    return { id: result.rows[0].id };
}

async function deleteSchedule(userId, scheduleId) {
    await pool.query('DELETE FROM schedules WHERE id = $1 AND user_id = $2', [scheduleId, userId]);
}

// Exception methods
async function getExceptions(userId) {
    const result = await pool.query('SELECT * FROM exceptions WHERE user_id = $1 ORDER BY date', [userId]);
    return result.rows;
}

async function createException(userId, exception) {
    const result = await pool.query(`
        INSERT INTO exceptions (user_id, date, moved_to_date, reason)
        VALUES ($1, $2, $3, $4)
        RETURNING id
    `, [userId, exception.date, exception.movedToDate || null, exception.reason || null]);

    return { id: result.rows[0].id };
}

async function deleteException(userId, exceptionId) {
    await pool.query('DELETE FROM exceptions WHERE id = $1 AND user_id = $2', [exceptionId, userId]);
}

// Reminder methods
async function getReminders(userId) {
    let result = await pool.query('SELECT * FROM reminders WHERE user_id = $1', [userId]);

    if (result.rows.length === 0) {
        await pool.query('INSERT INTO reminders (user_id) VALUES ($1)', [userId]);
        result = await pool.query('SELECT * FROM reminders WHERE user_id = $1', [userId]);
    }

    return result.rows[0];
}

async function updateReminders(userId, nightBefore, morningOf, timezone) {
    await pool.query(`
        INSERT INTO reminders (user_id, night_before, morning_of, timezone, updated_at)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id) DO UPDATE SET
            night_before = EXCLUDED.night_before,
            morning_of = EXCLUDED.morning_of,
            timezone = EXCLUDED.timezone,
            updated_at = CURRENT_TIMESTAMP
    `, [userId, nightBefore, morningOf, timezone || 'UTC']);
}

// Notification log methods
async function wasNotificationSent(userId, type, date) {
    const result = await pool.query(`
        SELECT * FROM notification_log
        WHERE user_id = $1 AND notification_type = $2 AND sweeping_date = $3
    `, [userId, type, date]);

    return result.rows.length > 0;
}

async function logNotification(userId, type, date) {
    await pool.query(`
        INSERT INTO notification_log (user_id, notification_type, sweeping_date)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, notification_type, sweeping_date) DO NOTHING
    `, [userId, type, date]);
}

// Get all users for notification checking
async function getAllUsers() {
    const result = await pool.query('SELECT * FROM users');
    return result.rows;
}

module.exports = {
    initializeDatabase,
    getOrCreateUser,
    savePushSubscription,
    getPushSubscriptions,
    deletePushSubscription,
    getSchedules,
    createSchedule,
    deleteSchedule,
    getExceptions,
    createException,
    deleteException,
    getReminders,
    updateReminders,
    wasNotificationSent,
    logNotification,
    getAllUsers,
    pool
};
