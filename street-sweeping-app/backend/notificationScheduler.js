const cron = require('node-cron');
const webpush = require('web-push');
const db = require('./database');

// Initialize web-push with VAPID keys
function initializeWebPush() {
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
        console.error('VAPID keys not set! Generate them with: npx web-push generate-vapid-keys');
        return false;
    }

    webpush.setVapidDetails(
        'mailto:' + (process.env.CONTACT_EMAIL || 'your-email@example.com'),
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );

    console.log('Web Push initialized successfully');
    return true;
}

// Calculate next sweeping date for a user
async function getNextSweepingDate(userId) {
    const schedules = await db.getSchedules(userId);
    const exceptions = await db.getExceptions(userId);

    if (schedules.length === 0) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let closestDate = null;
    let closestSchedule = null;

    // Check next 90 days
    for (let i = 0; i < 90; i++) {
        const checkDate = new Date(today);
        checkDate.setDate(today.getDate() + i);
        const dateStr = checkDate.toISOString().split('T')[0];

        // Check if this date is a moved-to date
        const movedToThisDate = exceptions.find(ex => ex.moved_to_date === dateStr);
        if (movedToThisDate) {
            const schedule = schedules.find(s => s.active);
            if (schedule && (!closestDate || checkDate < closestDate)) {
                closestDate = checkDate;
                closestSchedule = schedule;
            }
            continue;
        }

        // Check if this date is an exception (original date that was moved or cancelled)
        const isException = exceptions.some(ex => ex.date === dateStr);
        if (isException) continue;

        // Check each schedule for regular sweeping days
        for (const schedule of schedules) {
            if (!schedule.active) continue;

            // Check if day of week matches
            if (checkDate.getDay() !== schedule.day_of_week) continue;

            // Get week of month (1-5)
            const weekOfMonth = Math.ceil(checkDate.getDate() / 7);

            // Parse week pattern from JSON
            const weekPattern = JSON.parse(schedule.week_pattern);

            // Check if week pattern matches
            if (weekPattern.includes(weekOfMonth)) {
                if (!closestDate || checkDate < closestDate) {
                    closestDate = checkDate;
                    closestSchedule = schedule;
                }
            }
        }
    }

    return closestDate ? { date: closestDate, schedule: closestSchedule } : null;
}

// Send push notification to a user
async function sendPushNotification(subscription, payload) {
    try {
        await webpush.sendNotification(subscription, JSON.stringify(payload));
        console.log('Push notification sent successfully');
        return true;
    } catch (error) {
        console.error('Error sending push notification:', error);
        // If subscription is invalid (410), you might want to remove it from database
        if (error.statusCode === 410) {
            console.log('Subscription expired, removing from database:', subscription.endpoint);
            await db.deletePushSubscription(subscription.endpoint);
        }

        return false;
    }
}

// Get the current calendar date (YYYY-MM-DD) in the user's local timezone
function getLocalDateStr(timezone) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
}

// Format time for display
function formatTime(time24) {
    const [hours, minutes] = time24.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
}

// Check and send notifications for all users
async function checkAndSendNotifications() {
    const users = await db.getAllUsers();
    const now = new Date();
    const currentHour = now.getUTCHours();
    const currentMinute = now.getUTCMinutes();

    console.log(`Checking notifications at ${currentHour}:${currentMinute.toString().padStart(2, '0')} UTC`);

    console.log(`Found ${users.length} users to check`);

    for (const user of users) {
        try {
            const nextSweeping = await getNextSweepingDate(user.id);
            if (!nextSweeping) {
                console.log(`User ${user.id}: No upcoming sweeping found`);
                continue;
            }

            const { date, schedule } = nextSweeping;
            const reminders = await db.getReminders(user.id);

            console.log(`User ${user.id}: Next sweeping ${date.toISOString().split('T')[0]}, Reminders: night=${reminders.night_before}, morning=${reminders.morning_of}`);

            // Calculate days until sweeping using the user's local timezone
            const userTimezone = reminders.timezone || 'UTC';
            const todayStr = getLocalDateStr(userTimezone);
            const sweepingStr = date.toISOString().split('T')[0];
            const todayMs = new Date(todayStr + 'T00:00:00.000Z').getTime();
            const sweepingMs = new Date(sweepingStr + 'T00:00:00.000Z').getTime();
            const daysBefore = Math.round((sweepingMs - todayMs) / (1000 * 60 * 60 * 24));

            const dateStr = date.toISOString().split('T')[0];

            console.log(`User ${user.id}: daysBefore=${daysBefore}, currentTime=${currentHour}:${currentMinute}`);

            // Night before notification (if sweeping is tomorrow)
            if (daysBefore === 1) {
                const [nightHour, nightMinute] = reminders.night_before.split(':').map(Number);

                console.log(`User ${user.id}: Checking night-before: need ${nightHour}:${nightMinute}, have ${currentHour}:${currentMinute}`);

                if (currentHour === nightHour && currentMinute === nightMinute) {
                    // Check if we already sent this notification
                    if (!(await db.wasNotificationSent(user.id, 'night_before', dateStr))) {
                        const subscriptions = await db.getPushSubscriptions(user.id);

                        const payload = {
                            title: 'Street Sweeping Tomorrow!',
                            body: `Don't forget to move your car by ${formatTime(schedule.start_time)} tomorrow.`,
                            icon: '/icons/streetSweeperAppIcon.png',
                            vibrate: [200, 100, 200],
                            tag: 'street-sweeping-reminder',
                            requireInteraction: true,
                            data: {
                                url: '/',
                                date: dateStr
                            }
                        };

                        for (const sub of subscriptions) {
                            const subscription = {
                                endpoint: sub.endpoint,
                                keys: {
                                    p256dh: sub.p256dh,
                                    auth: sub.auth
                                }
                            };

                            await sendPushNotification(subscription, payload);
                        }

                        await db.logNotification(user.id, 'night_before', dateStr);
                        console.log(`Sent night-before notification to user ${user.id}`);
                    }
                }
            }

            // Morning of notification (if sweeping is today)
            if (daysBefore === 0) {
                const [morningHour, morningMinute] = reminders.morning_of.split(':').map(Number);

                if (currentHour === morningHour && currentMinute === morningMinute) {
                    // Check if we already sent this notification
                    if (!(await db.wasNotificationSent(user.id, 'morning_of', dateStr))) {
                        const subscriptions = await db.getPushSubscriptions(user.id);

                        const payload = {
                            title: 'Street Sweeping Today!',
                            body: `Move your car by ${formatTime(schedule.start_time)}. Sweeping: ${formatTime(schedule.start_time)} - ${formatTime(schedule.end_time)}`,
                            icon: '/icons/streetSweeperAppIcon.png',
                            vibrate: [200, 100, 200],
                            tag: 'street-sweeping-reminder',
                            requireInteraction: true,
                            data: {
                                url: '/',
                                date: dateStr
                            }
                        };

                        for (const sub of subscriptions) {
                            const subscription = {
                                endpoint: sub.endpoint,
                                keys: {
                                    p256dh: sub.p256dh,
                                    auth: sub.auth
                                }
                            };

                            await sendPushNotification(subscription, payload);
                        }

                        await db.logNotification(user.id, 'morning_of', dateStr);
                        console.log(`Sent morning-of notification to user ${user.id}`);
                    }
                }
            }
        } catch (error) {
            console.error(`Error processing notifications for user ${user.id}:`, error);
        }
    }
}

// Start the notification scheduler
function startScheduler() {
    if (!initializeWebPush()) {
        console.error('Cannot start scheduler without VAPID keys');
        return;
    }

    // Run every minute
    cron.schedule('* * * * *', () => {
        checkAndSendNotifications();
    });

    console.log('Notification scheduler started (runs every minute)');
}

module.exports = {
    startScheduler,
    initializeWebPush,
    sendPushNotification
};
