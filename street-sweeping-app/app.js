// Street Sweeping Reminder App - Complete JavaScript

// State Management
let state = {
    schedules: [],
    exceptions: [],
    reminders: {
        nightBefore: '20:00',
        morningOf: '07:00'
    }
};

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
    loadState();
    await loadDataFromBackend();
    initEventListeners();
    updateNextSweepingDisplay();
    setupPWAInstall();
    registerServiceWorker(); // This now starts the chain for push registration
});

// Load state from localStorage
function loadState() {
    const savedState = localStorage.getItem('sweepingAppState');
    if (savedState) {
        try {
            const parsed = JSON.parse(savedState);
            // Only use parsed state if it's a valid object with required properties
            if (parsed && typeof parsed === 'object' && parsed.reminders) {
                state = parsed;
            } else {
                // Clear invalid state from localStorage
                localStorage.removeItem('sweepingAppState');
            }
        } catch (e) {
            // If parsing fails, clear invalid state
            localStorage.removeItem('sweepingAppState');
        }
    }

    const nightTime = document.getElementById('nightBeforeTime');
    const morningTime = document.getElementById('morningOfTime');
    if (nightTime) nightTime.value = state.reminders.nightBefore;
    if (morningTime) morningTime.value = state.reminders.morningOf;

    renderSchedules();
    renderExceptions();
}

function saveState() {
    localStorage.setItem('sweepingAppState', JSON.stringify(state));
    updateNextSweepingDisplay();
}

// Load data from backend
async function loadDataFromBackend() {
    try {
        // Load schedules and map field names from snake_case to camelCase
        const schedules = await API.getSchedules();
        if (schedules && schedules.length > 0) {
            state.schedules = schedules.map(s => ({
                id: s.id,
                name: s.label || 'Street Sweeping',
                dayOfWeek: s.day_of_week,
                weekPattern: JSON.parse(s.week_pattern),
                startTime: s.start_time,
                endTime: s.end_time,
                active: s.active === 1
            }));
        }

        // Load exceptions and map field names
        const exceptions = await API.getExceptions();
        if (exceptions && exceptions.length > 0) {
            state.exceptions = exceptions.map(e => ({
                id: e.id,
                date: e.date,
                movedToDate: e.moved_to_date,
                reason: e.reason
            }));
        }

        // Load reminders (backend stores UTC, convert to local)
        const reminders = await API.getReminders();
        if (reminders && reminders.nightBefore && reminders.morningOf) {
            // Convert UTC times to local times for display
            state.reminders.nightBefore = convertUTCTimeToLocal(reminders.nightBefore);
            state.reminders.morningOf = convertUTCTimeToLocal(reminders.morningOf);

            const nightTime = document.getElementById('nightBeforeTime');
            const morningTime = document.getElementById('morningOfTime');
            if (nightTime) nightTime.value = state.reminders.nightBefore;
            if (morningTime) morningTime.value = state.reminders.morningOf;
        }

        // Save merged state to localStorage
        saveState();
        renderSchedules();
        renderExceptions();
    } catch (error) {
        console.error('Error loading data from backend:', error);
        // Don't show alert - app will work with localStorage data
    }
}

// Initialize event listeners
function initEventListeners() {
    document.getElementById('addScheduleBtn')?.addEventListener('click', () => openModal('scheduleModal'));
    document.getElementById('closeScheduleModal')?.addEventListener('click', () => closeModal('scheduleModal'));
    document.getElementById('cancelSchedule')?.addEventListener('click', () => closeModal('scheduleModal'));
    document.getElementById('scheduleForm')?.addEventListener('submit', handleScheduleSubmit);

    document.getElementById('addExceptionBtn')?.addEventListener('click', () => openModal('exceptionModal'));
    document.getElementById('closeExceptionModal')?.addEventListener('click', () => closeModal('exceptionModal'));
    document.getElementById('cancelException')?.addEventListener('click', () => closeModal('exceptionModal'));
    document.getElementById('exceptionForm')?.addEventListener('submit', handleExceptionSubmit);

    document.getElementById('saveRemindersBtn')?.addEventListener('click', handleRemindersSave);

    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal(modal.id);
        });
    });
}

function openModal(modalId) { document.getElementById(modalId)?.classList.add('active'); }
function closeModal(modalId) { 
    document.getElementById(modalId)?.classList.remove('active'); 
    const form = document.getElementById(modalId === 'scheduleModal' ? 'scheduleForm' : 'exceptionForm');
    form?.reset();
}

// Handle schedule form submission
async function handleScheduleSubmit(e) {
    e.preventDefault();
    const schedule = {
        name: document.getElementById('scheduleName').value || 'Street Sweeping',
        dayOfWeek: parseInt(document.getElementById('dayOfWeek').value),
        weekPattern: Array.from(document.querySelectorAll('input[name="weekPattern"]:checked')).map(cb => parseInt(cb.value)),
        startTime: document.getElementById('startTime').value,
        endTime: document.getElementById('endTime').value
    };

    if (schedule.weekPattern.length === 0) {
        alert('Please select at least one week of the month');
        return;
    }

    try {
        const result = await API.createSchedule(schedule);
        schedule.id = result.id;
        schedule.active = true;
        state.schedules.push(schedule);
        saveState();
        renderSchedules();
        closeModal('scheduleModal');
    } catch (error) {
        console.error('Error saving schedule:', error);
        alert('Failed to save schedule.');
    }
}

// Handle exception form submission
async function handleExceptionSubmit(e) {
    e.preventDefault();
    const exception = {
        date: document.getElementById('exceptionDate').value,
        movedToDate: document.getElementById('movedToDate').value || null,
        reason: document.getElementById('exceptionReason').value || 'Schedule Change'
    };

    try {
        const result = await API.createException(exception);
        exception.id = result.id;
        state.exceptions.push(exception);
        saveState();
        renderExceptions();
        closeModal('exceptionModal');
    } catch (error) {
        console.error('Error saving exception:', error);
        alert('Failed to save schedule change.');
    }
}

// Convert local time (HH:MM) to UTC time (HH:MM)
function convertLocalTimeToUTC(localTime) {
    const [hours, minutes] = localTime.split(':').map(Number);
    const now = new Date();
    const localDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
    const utcHours = localDate.getUTCHours().toString().padStart(2, '0');
    const utcMinutes = localDate.getUTCMinutes().toString().padStart(2, '0');
    return `${utcHours}:${utcMinutes}`;
}

// Convert UTC time (HH:MM) to local time (HH:MM)
function convertUTCTimeToLocal(utcTime) {
    const [hours, minutes] = utcTime.split(':').map(Number);
    const now = new Date();
    const utcDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hours, minutes));
    const localHours = utcDate.getHours().toString().padStart(2, '0');
    const localMinutes = utcDate.getMinutes().toString().padStart(2, '0');
    return `${localHours}:${localMinutes}`;
}

// Handle reminder settings save
async function handleRemindersSave() {
    const nightBefore = document.getElementById('nightBeforeTime').value;
    const morningOf = document.getElementById('morningOfTime').value;

    try {
        // Convert to UTC before sending to backend
        const nightBeforeUTC = convertLocalTimeToUTC(nightBefore);
        const morningOfUTC = convertLocalTimeToUTC(morningOf);
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

        await API.updateReminders(nightBeforeUTC, morningOfUTC, timezone);

        // Store local times in state for display
        state.reminders.nightBefore = nightBefore;
        state.reminders.morningOf = morningOf;
        saveState();

        // Ensure the backend has our latest subscription after updating settings
        await subscribeToPushNotifications();
        alert('Reminder times saved and notifications synced!');
    } catch (error) {
        console.error('Error saving reminders:', error);
        alert('Failed to save reminder times.');
    }
}

// UI Rendering Functions
function renderSchedules() {
    const scheduleList = document.getElementById('scheduleList');
    if (!scheduleList) return;
    if (state.schedules.length === 0) {
        scheduleList.innerHTML = '<div class="empty-state">No schedules added yet</div>';
        return;
    }
    scheduleList.innerHTML = state.schedules.map(schedule => {
        const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][schedule.dayOfWeek];
        const weeksText = schedule.weekPattern.map(w => w + (['', 'st', 'nd', 'rd', 'th', 'th'][w] || 'th')).join(', ');
        return `
            <div class="schedule-item">
                <div class="schedule-info">
                    <div class="schedule-label">${schedule.name}</div>
                    <div class="schedule-details">${weeksText} ${dayName} • ${formatTime(schedule.startTime)} - ${formatTime(schedule.endTime)}</div>
                </div>
                <button class="delete-btn" onclick="deleteSchedule(${schedule.id})">×</button>
            </div>`;
    }).join('');
}

function renderExceptions() {
    const exceptionsList = document.getElementById('exceptionsList');
    if (!exceptionsList) return;
    if (state.exceptions.length === 0) {
        exceptionsList.innerHTML = '<div class="empty-state">No schedule changes added</div>';
        return;
    }
    const sorted = [...state.exceptions].sort((a, b) => new Date(a.date) - new Date(b.date));
    exceptionsList.innerHTML = sorted.map(ex => {
        const d = new Date(ex.date + 'T00:00:00');
        const dStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
        let detailsText = dStr;
        if (ex.movedToDate) {
            const m = new Date(ex.movedToDate + 'T00:00:00');
            detailsText = `${dStr} → ${m.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}`;
        }
        return `
            <div class="exception-item">
                <div class="exception-info">
                    <div class="schedule-label">${ex.reason}</div>
                    <div class="exception-details">${detailsText}</div>
                </div>
                <button class="delete-btn" onclick="deleteException(${ex.id})">×</button>
            </div>`;
    }).join('');
}

async function deleteSchedule(id) {
    if (confirm('Delete this schedule?')) {
        try {
            await API.deleteSchedule(id);
            state.schedules = state.schedules.filter(s => s.id !== id);
            saveState();
            renderSchedules();
        } catch (error) {
            console.error('Error deleting schedule:', error);
            alert('Failed to delete schedule.');
        }
    }
}

async function deleteException(id) {
    if (confirm('Delete this exception?')) {
        try {
            await API.deleteException(id);
            state.exceptions = state.exceptions.filter(e => e.id !== id);
            saveState();
            renderExceptions();
        } catch (error) {
            console.error('Error deleting exception:', error);
            alert('Failed to delete exception.');
        }
    }
}

function formatTime(time24) {
    const [hours, minutes] = time24.split(':');
    const hour = parseInt(hours);
    return `${hour % 12 || 12}:${minutes} ${hour >= 12 ? 'PM' : 'AM'}`;
}

// Update display logic
function updateNextSweepingDisplay() {
    const nextSweeping = getNextSweepingDate();
    const nextDateLarge = document.getElementById('nextDateLarge');
    const timeInfo = document.getElementById('timeInfo');
    const countdown = document.getElementById('countdown');
    if (!nextDateLarge || !nextSweeping) return;

    const { date, schedule } = nextSweeping;
    nextDateLarge.textContent = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    timeInfo.textContent = `${formatTime(schedule.startTime)} - ${formatTime(schedule.endTime)}`;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sweepingDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const daysUntil = Math.round((sweepingDay - today) / (1000 * 60 * 60 * 24));

    countdown.textContent = daysUntil === 0 ? 'TODAY!' : daysUntil === 1 ? 'Tomorrow' : `In ${daysUntil} days`;
    countdown.className = daysUntil <= 1 ? 'urgent' : '';
}

function getNextSweepingDate() {
    if (state.schedules.length === 0) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 90; i++) {
        const checkDate = new Date(today);
        checkDate.setDate(today.getDate() + i);
        const dateStr = checkDate.toISOString().split('T')[0];
        const movedTo = state.exceptions.find(ex => ex.movedToDate === dateStr);
        if (movedTo) return { date: checkDate, schedule: state.schedules.find(s => s.active) };
        if (state.exceptions.some(ex => ex.date === dateStr)) continue;
        for (const schedule of state.schedules) {
            if (schedule.active && checkDate.getDay() === schedule.dayOfWeek) {
                const weekOfMonth = Math.ceil(checkDate.getDate() / 7);
                if (schedule.weekPattern.includes(weekOfMonth)) return { date: checkDate, schedule };
            }
        }
    }
    return null;
}

// --- PUSH NOTIFICATION LOGIC ---
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/service-worker.js')
            .then(reg => {
                console.log('SW Registered');
                checkNotificationPermission();
            })
            .catch(err => console.log('SW Registration failed', err));
    }
}

function checkNotificationPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
        setTimeout(() => {
            if (confirm('Enable notifications?')) {
                Notification.requestPermission().then(p => { if (p === 'granted') subscribeToPushNotifications(); });
            }
        }, 2000);
    } else if (Notification.permission === 'granted') {
        subscribeToPushNotifications();
    }
}

async function subscribeToPushNotifications() {
    try {
        const reg = await navigator.serviceWorker.ready;
        const response = await API.getVapidPublicKey();
        let publicKey = typeof response === 'object' ? response.publicKey : response;
        publicKey = publicKey.replace(/[\\"]/g, '').trim(); // SCRUB QUOTES

        const sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey)
        });

        console.log('Push Endpoint:', sub.endpoint);
        await API.subscribeToPush(sub);
    } catch (err) {
        console.error('Push Subscription Failed', err);
    }
}

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}

function setupPWAInstall() {
    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        const sect = document.getElementById('installSection');
        if (sect) sect.style.display = 'block';
    });
    document.getElementById('installBtn')?.addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            deferredPrompt = null;
            const sect = document.getElementById('installSection');
            if (sect) sect.style.display = 'none';
        }
    });
}

setInterval(updateNextSweepingDisplay, 60000);
