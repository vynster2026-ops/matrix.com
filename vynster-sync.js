/**
 * VYNSTER UNIFIED REAL-TIME SYNC ENGINE
 * Synchronizes real-time state, appointments, staff attendance, leave requests, 
 * and database updates across vynster-salon.html, vynster-staff.html, and vynster-booking.html
 */
(function () {
    const CHANNEL_NAME = 'vynster_sync_channel';
    let bc = null;
    try {
        if ('BroadcastChannel' in window) {
            bc = new BroadcastChannel(CHANNEL_NAME);
        }
    } catch (e) { }

    let socket = null;
    if (typeof io !== 'undefined') {
        try {
            socket = io();
            window.vynsterSocket = socket;
        } catch (e) {
            console.log('Socket.IO init notice:', e);
        }
    }

    // Unified Event Emitter
    window.vynsterSyncEmit = function (eventName, data) {
        console.log('[VYNSTER SYNC EMIT]', eventName, data);

        // 1. BroadcastChannel (0ms cross-tab sync)
        if (bc) {
            try {
                bc.postMessage({ event: eventName, data: data, timestamp: Date.now() });
            } catch (err) { }
        }

        // 2. Socket.IO (Server broadcast)
        if (socket && socket.connected) {
            try {
                socket.emit(eventName, data);
                if (eventName === 'newAppointment') {
                    socket.emit('booking_created', data);
                    socket.emit('bookingCreated', data);
                } else if (eventName === 'appointmentUpdated') {
                    socket.emit('booking_updated', data);
                    socket.emit('bookingUpdated', data);
                }
            } catch (err) { }
        }

        // 3. LocalStorage event fallback
        try {
            localStorage.setItem('vynster_last_sync_event', JSON.stringify({
                event: eventName,
                data: data,
                _t: Date.now()
            }));
        } catch (err) { }
    };

    // Unified Event Listener
    window.vynsterSyncOn = function (eventNames, callback) {
        const events = Array.isArray(eventNames) ? eventNames : [eventNames];

        events.forEach(eventName => {
            if (socket) {
                socket.on(eventName, callback);
            }
        });

        if (bc) {
            bc.addEventListener('message', (msg) => {
                if (msg.data && (msg.data.event === eventName || events.includes(msg.data.event))) {
                    callback(msg.data.data);
                }
            });
        }

        window.addEventListener('storage', (e) => {
            if (e.key === 'vynster_last_sync_event' && e.newValue) {
                try {
                    const parsed = JSON.parse(e.newValue);
                    if (events.includes(parsed.event)) {
                        callback(parsed.data);
                    }
                } catch (err) { }
            }
        });
    };

    console.log('⚡ Vynster Real-Time Sync Engine initialized.');
})();
