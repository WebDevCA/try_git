// API Client for Street Sweeping Reminder Backend

// Configuration
const API_BASE_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : window.location.origin; // Same origin - backend serves everything


// Get or create device ID
function getDeviceId() {
    let deviceId = localStorage.getItem('deviceId');
    if (!deviceId) {
        deviceId = 'device_' + Math.random().toString(36).substr(2, 9) + Date.now();
        localStorage.setItem('deviceId', deviceId);
    }
    return deviceId;
}

// Make API request with device ID header
async function apiRequest(endpoint, options = {}) {
    const deviceId = getDeviceId();

    const headers = {
        'Content-Type': 'application/json',
        'X-Device-ID': deviceId,
        ...options.headers
    };

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
}

// VAPID Public Key
async function getVapidPublicKey() {
    return apiRequest('/api/vapid-public-key');
}

// Push Subscription
async function subscribeToPush(subscription) {
    return apiRequest('/api/subscribe', {
        method: 'POST',
        body: JSON.stringify(subscription)
    });
}

// Schedules
async function getSchedules() {
    return apiRequest('/api/schedules');
}

async function createSchedule(schedule) {
    return apiRequest('/api/schedules', {
        method: 'POST',
        body: JSON.stringify(schedule)
    });
}

async function deleteSchedule(id) {
    return apiRequest(`/api/schedules/${id}`, {
        method: 'DELETE'
    });
}

// Exceptions
async function getExceptions() {
    return apiRequest('/api/exceptions');
}

async function createException(exception) {
    return apiRequest('/api/exceptions', {
        method: 'POST',
        body: JSON.stringify(exception)
    });
}

async function deleteException(id) {
    return apiRequest(`/api/exceptions/${id}`, {
        method: 'DELETE'
    });
}

// Reminders
async function getReminders() {
    return apiRequest('/api/reminders');
}

async function updateReminders(nightBefore, morningOf, timezone) {
    return apiRequest('/api/reminders', {
        method: 'PUT',
        body: JSON.stringify({ nightBefore, morningOf, timezone })
    });
}

// Export API client
const API = {
    getVapidPublicKey,
    subscribeToPush,
    getSchedules,
    createSchedule,
    deleteSchedule,
    getExceptions,
    createException,
    deleteException,
    getReminders,
    updateReminders,
    getDeviceId
};

// Make API globally accessible
window.API = API;
