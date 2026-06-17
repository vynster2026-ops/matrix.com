require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const Razorpay = require('razorpay');
const crypto = require('crypto');

const app = express();
app.use(cors()); // Permissive CORS for local development
app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Serve the main HTML file when someone visits the root URL (/)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'MedhikaArts_complete_module.html'));
});

// New removal route
app.post('/api/bookings/remove/:id', async (req, res) => {
    const id = req.params.id;
    console.log(`[CANCELLATION REQUEST] ID: ${id} at ${new Date().toISOString()}`);
    
    if (isConnected) {
        try {
            const result = await Booking.deleteOne({ $or: [{ id: id }, { _id: id }] });
            if (result.deletedCount > 0) {
                console.log(`[SUCCESS] Booking ${id} removed from MongoDB`);
                return res.json({ success: true });
            }
        } catch(e) { console.error('[ERROR] DB removal failed:', e); }
    }
    
    const idx = localDb.bookings.findIndex(b => b.id === id || b._id === id);
    if (idx !== -1) {
        localDb.bookings.splice(idx, 1);
        saveLocal();
        console.log(`[SUCCESS] Booking ${id} removed from localDb.json`);
        return res.json({ success: true });
    }
    
    console.log(`[NOT FOUND] Booking ${id} not found in any database`);
    res.status(404).json({ error: 'Booking not found' });
});

// Safe Removal route (GET) - Bypass browser POST restrictions
app.get('/api/bookings/remove-safe/:id', async (req, res) => {
    const id = req.params.id;
    console.log(`[SAFE CANCELLATION REQUEST] ID: ${id} at ${new Date().toISOString()}`);
    
    if (isConnected) {
        try {
            await Booking.deleteOne({ $or: [{ id: id }, { _id: id }] });
        } catch(e) {}
    }
    const idx = localDb.bookings.findIndex(b => b.id === id || b._id === id);
    if (idx !== -1) {
        localDb.bookings.splice(idx, 1);
        saveLocal();
    }
    // Always return success or redirect back to dashboard to avoid "stuck" page
    res.send('<script>alert("Cancellation processed."); window.close();</script>Cancellation successful. You can close this tab.');
});

// Update Booking route (PUT) - For Rescheduling
app.put('/api/bookings/:id', async (req, res) => {
    const id = req.params.id;
    const updatedData = req.body;
    console.log(`[UPDATE REQUEST] ID: ${id} at ${new Date().toISOString()}`);
    
    let mongoSuccess = false;
    if (isConnected) {
        try {
            await Booking.updateOne({ $or: [{ id: id }, { _id: id }] }, updatedData);
            console.log(`[SUCCESS] Booking ${id} updated in MongoDB`);
            mongoSuccess = true;
        } catch(e) { console.error('[ERROR] MongoDB update failed:', e); }
    }
    
    const idx = localDb.bookings.findIndex(b => b.id === id || b._id === id);
    if (idx !== -1) {
        localDb.bookings[idx] = { ...localDb.bookings[idx], ...updatedData };
        saveLocal();
        console.log(`[SUCCESS] Booking ${id} updated in localDb.json`);
        return res.json({ success: true });
    }
    
    if (mongoSuccess) {
        return res.json({ success: true });
    }
    
    res.status(404).json({ error: 'Booking not found' });
});

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/medhikaarts';
const DB_FILE = 'db.json';

let localDb = { clients: [], staff: [], services: [], inventory: [], bookings: [], expenses: [], campaigns: [], tickets: [] };
if (fs.existsSync(DB_FILE)) {
    try { 
        localDb = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); 
        if (!localDb.expenses) localDb.expenses = [];
        if (!localDb.campaigns) localDb.campaigns = [];
        if (!localDb.tickets) localDb.tickets = [];
    } catch (e) { console.error('Error reading db.json'); }
}
const saveLocal = () => fs.writeFileSync(DB_FILE, JSON.stringify(localDb, null, 2));

// Initialize Razorpay (Replace with your actual keys from Razorpay Dashboard)
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_YourKeyHere',
    key_secret: process.env.RAZORPAY_KEY_SECRET || 'YourSecretHere'
});

mongoose.set('bufferCommands', false);

let isConnected = false;
mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 })
  .then(() => { console.log('Connected to MongoDB'); isConnected = true; })
  .catch(err => { console.error('MongoDB connection failed. Falling back to local storage.', err); isConnected = false; });

const clientSchema = new mongoose.Schema({ id: String, name: String, phone: String, email: String, location: String, pts: Number, ltv: String, av: String }, { bufferCommands: false });
const staffSchema = new mongoose.Schema({ id: String, name: String, gender: String, spec: String, rating: String, av: String, services: [String], status: String, attendance: Array, performanceScore: Number, hireDate: String, alerts: Array, commissionRate: Object, retentionRate: String }, { bufferCommands: false, strict: false });
const serviceSchema = new mongoose.Schema({ id: String, name: String, cat: String, duration: Number, price: Number, prices: [Number], icon: String, gender: String }, { bufferCommands: false });
const inventorySchema = new mongoose.Schema({ id: String, name: String, cat: String, stock: Number, min: Number, unit: String, cost: Number }, { bufferCommands: false });
const bookingSchema = new mongoose.Schema({ id: String, clientId: String, clientName: String, services: [String], staffId: mongoose.Schema.Types.Mixed, additionalStaff: Array, date: String, time: String, total: Number, status: String, notes: String, source: String, location: String, deposit: Boolean, timestamp: String }, { bufferCommands: false, strict: false });

const Client = mongoose.model('Client', clientSchema);
const Staff = mongoose.model('Staff', staffSchema);
const Service = mongoose.model('Service', serviceSchema);
const Inventory = mongoose.model('Inventory', inventorySchema);
const Booking = mongoose.model('Booking', bookingSchema);

const eventSchema = new mongoose.Schema({ id: String, title: String, date: String, time: String, type: String, description: String }, { bufferCommands: false });
const Event = mongoose.model('Event', eventSchema);

const expenseSchema = new mongoose.Schema({ id: String, cat: String, desc: String, amount: Number, date: String, method: String }, { bufferCommands: false });
const Expense = mongoose.model('Expense', expenseSchema);

const campaignSchema = new mongoose.Schema({
    id: String,
    name: String,
    message: String,
    mediaUrls: [String],
    recipientsCount: Number,
    status: String,
    timestamp: String,
    results: Array
}, { bufferCommands: false });
const Campaign = mongoose.model('Campaign', campaignSchema);

// SSE Clients array for live sync
let sseClients = [];
function notifyLiveClients(message = 'refreshData') {
    sseClients.forEach(client => {
        try { client.res.write(`data: ${message}\n\n`); } catch(e) {}
    });
}

app.get('/api/live', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); // flush the headers to establish SSE connection
    
    const client = { id: Date.now(), res };
    sseClients.push(client);
    
    // Send initial heartbeat
    res.write('data: connected\n\n');
    
    req.on('close', () => {
        sseClients = sseClients.filter(c => c.id !== client.id);
    });
});

// Clients
app.get('/api/clients', async (req, res) => {
    if (isConnected) { try { return res.json(await Client.find()); } catch(e) {} }
    res.json(localDb.clients);
});
app.post('/api/clients', async (req, res) => {
    let result = req.body;
    if (isConnected) { try { result = await new Client(req.body).save(); } catch(e) {} }
    else { localDb.clients.push(req.body); saveLocal(); }
    notifyLiveClients();
    res.json(result);
});
app.put('/api/clients/:id', async (req, res) => {
    const searchId = String(req.params.id).trim();
    if (isConnected) {
        try {
            const updated = await Client.findOneAndUpdate(
                { $or: [{ id: searchId }, { name: { $regex: new RegExp(`^${searchId}$`, 'i') } }] },
                req.body,
                { new: true }
            );
            if (updated) return res.json(updated);
        } catch(e) {}
    }
    const idx = localDb.clients.findIndex(c => 
        String(c.id).trim() === searchId || 
        String(c.name).trim().toLowerCase() === searchId.toLowerCase()
    );
    if (idx !== -1) {
        localDb.clients[idx] = { ...localDb.clients[idx], ...req.body };
        saveLocal();
        return res.json(localDb.clients[idx]);
    }
    res.status(404).json({ error: 'Client not found' });
});

// Staff
app.get('/api/staff', async (req, res) => {
    if (isConnected) { try { return res.json(await Staff.find()); } catch(e) {} }
    res.json(localDb.staff);
});
app.post('/api/staff', async (req, res) => {
    if (isConnected) { try { return res.json(await new Staff(req.body).save()); } catch(e) {} }
    localDb.staff.push(req.body); saveLocal(); res.json(req.body);
});

app.put('/api/staff/:id', async (req, res) => {
    if (isConnected) { 
        try { 
            const updated = await Staff.findOneAndUpdate(
                { id: req.params.id }, 
                req.body, 
                { new: true }
            );
            if (updated) return res.json(updated);
        } catch(e) {} 
    }
    const idx = localDb.staff.findIndex(s => s.id === req.params.id);
    if (idx !== -1) { 
        localDb.staff[idx] = { ...localDb.staff[idx], ...req.body }; 
        saveLocal(); 
        return res.json(localDb.staff[idx]); 
    }
    res.status(404).json({ error: 'Not found' });
});

// Staff Analytics & Features Endpoints
app.get('/api/staff/summary', async (req, res) => {
    let staffData = localDb.staff;
    if (isConnected) { try { staffData = await Staff.find(); } catch(e){} }
    if (!staffData || staffData.length === 0) return res.json({ retentionRate: 0, activeCount: 0, totalCount: 0 });
    const active = staffData.filter(s => s.status !== 'Terminated' && s.status !== 'Resigned').length;
    res.json({ retentionRate: Math.round((active / staffData.length) * 100), activeCount: active, totalCount: staffData.length });
});

app.get('/api/staff/leaderboard', async (req, res) => {
    let staffData = localDb.staff;
    let bookingsData = localDb.bookings;
    if (isConnected) { 
        try { 
            staffData = await Staff.find(); 
            bookingsData = await Booking.find();
        } catch(e){} 
    }
    
    let stats = staffData.map(s => ({ id: s.id, name: s.name, av: s.av, revenue: 0, servicesCount: 0 }));
    bookingsData.forEach(b => {
        if ((b.status || '').toLowerCase() === 'completed') {
            let sStat = stats.find(st => st.id === b.staffId);
            if (sStat) {
                sStat.servicesCount += 1;
                sStat.revenue += Number(b.total) || 0;
            }
            if (b.additionalStaff && Array.isArray(b.additionalStaff)) {
                b.additionalStaff.forEach(asId => {
                    let asStat = stats.find(st => st.id === asId);
                    if (asStat) asStat.servicesCount += 1;
                });
            }
        }
    });
    stats.sort((a, b) => b.revenue - a.revenue);
    res.json(stats);
});

app.get('/api/staff/performance', async (req, res) => {
    let staffData = localDb.staff;
    let bookingsData = localDb.bookings;
    if (isConnected) { 
        try { 
            staffData = await Staff.find(); 
            bookingsData = await Booking.find();
        } catch(e){} 
    }
    
    let stats = staffData.map(s => ({ id: s.id, name: s.name, status: s.status || 'Online', servicesCount: 0, revenue: 0, commission: 0 }));
    const commissionRate = 0.10; // Fixed 10%
    
    bookingsData.forEach(b => {
        if ((b.status || '').toLowerCase() === 'completed') {
            let assignedCount = 1;
            if (b.additionalStaff && Array.isArray(b.additionalStaff)) assignedCount += b.additionalStaff.length;
            const revenuePerStaff = (Number(b.total) || 0) / assignedCount;
            const commissionPerStaff = revenuePerStaff * commissionRate;
            
            let sStat = stats.find(st => st.id === b.staffId);
            if (sStat) {
                sStat.servicesCount += 1; sStat.revenue += revenuePerStaff; sStat.commission += commissionPerStaff;
            }
            if (b.additionalStaff && Array.isArray(b.additionalStaff)) {
                b.additionalStaff.forEach(asId => {
                    let asStat = stats.find(st => st.id === asId);
                    if (asStat) {
                        asStat.servicesCount += 1; asStat.revenue += revenuePerStaff; asStat.commission += commissionPerStaff;
                    }
                });
            }
        }
    });
    res.json(stats);
});

app.get('/api/staff/alerts', async (req, res) => {
    let staffData = localDb.staff;
    let bookingsData = localDb.bookings;
    let clientsData = localDb.clients;
    if (isConnected) { 
        try { 
            staffData = await Staff.find(); 
            bookingsData = await Booking.find();
            clientsData = await Client.find();
        } catch(e){} 
    }
    
    let alerts = [];
    const upcomingBookings = bookingsData.filter(b => b.status && b.status.toLowerCase() !== 'completed' && b.status.toLowerCase() !== 'cancelled');
    
    staffData.forEach(s => {
        const sBookings = upcomingBookings.filter(b => b.staffId === s.id || (b.additionalStaff && Array.isArray(b.additionalStaff) && b.additionalStaff.includes(s.id)));
        if (sBookings.length > 3) {
            alerts.push({ staffId: s.id, staffName: s.name, type: 'warning', title: 'High Volume Alert', message: `${s.name} has ${sBookings.length} upcoming appointments. Ensure adequate breaks are scheduled.` });
        }
        sBookings.forEach(b => {
            const client = clientsData.find(c => c.name === b.clientName);
            if (client && Number(client.pts) > 500) {
                alerts.push({ staffId: s.id, staffName: s.name, type: 'info', title: 'VIP Client', message: `${s.name} is serving VIP client ${client.name}. Please ensure premium service protocols.` });
            }
        });
    });
    res.json(alerts);
});

app.post('/api/staff/:id/attendance', async (req, res) => {
    const { action } = req.body; // 'check-in' or 'check-out'
    const today = new Date().toISOString().split('T')[0];
    const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    
    let staffMember = localDb.staff.find(s => s.id === req.params.id);
    if (isConnected) {
        try { staffMember = await Staff.findOne({ id: req.params.id }); } catch(e){}
    }
    if (!staffMember) return res.status(404).json({ error: 'Staff not found' });
    
    // Normalize attendance as an array
    if (typeof staffMember.toObject === 'function') {
        let updateDoc = { ...staffMember.toObject() };
        if (!updateDoc.attendance) updateDoc.attendance = [];
        let record = updateDoc.attendance.find(a => a.date === today);
        if (action === 'check-in' && !record) {
            updateDoc.attendance.push({ date: today, status: 'Present', checkIn: time, checkOut: null });
        } else if (action === 'check-out' && record) {
            record.status = 'Checked-Out'; record.checkOut = time;
        }
        try {
            await Staff.updateOne({ id: req.params.id }, { attendance: updateDoc.attendance });
            const idx = localDb.staff.findIndex(s => s.id === req.params.id);
            if (idx !== -1) { localDb.staff[idx].attendance = updateDoc.attendance; saveLocal(); }
            return res.json({ success: true, attendance: updateDoc.attendance });
        } catch(e) { return res.status(500).json({ error: 'DB Error' }); }
    } else {
        if (!staffMember.attendance) staffMember.attendance = [];
        let record = staffMember.attendance.find(a => a.date === today);
        if (action === 'check-in' && !record) {
            staffMember.attendance.push({ date: today, status: 'Present', checkIn: time, checkOut: null });
        } else if (action === 'check-out' && record) {
            record.status = 'Checked-Out'; record.checkOut = time;
        }
        saveLocal();
        return res.json({ success: true, attendance: staffMember.attendance });
    }
});

app.post('/api/staff/:id/leave-request', async (req, res) => {
    const { startDate, endDate, reason } = req.body;
    let staffMember = localDb.staff.find(s => s.id === req.params.id);
    if (isConnected) {
        try { staffMember = await Staff.findOne({ id: req.params.id }); } catch(e){}
    }
    if (!staffMember) return res.status(404).json({ error: 'Staff not found' });

    const newRequest = {
        id: 'leave-' + Date.now(),
        startDate,
        endDate,
        reason,
        status: 'Pending',
        createdAt: new Date().toISOString()
    };

    if (typeof staffMember.toObject === 'function') {
        let updateDoc = { ...staffMember.toObject() };
        if (!updateDoc.leaveRequests) updateDoc.leaveRequests = [];
        updateDoc.leaveRequests.push(newRequest);
        try {
            await Staff.updateOne({ id: req.params.id }, { leaveRequests: updateDoc.leaveRequests });
            const idx = localDb.staff.findIndex(s => s.id === req.params.id);
            if (idx !== -1) { localDb.staff[idx].leaveRequests = updateDoc.leaveRequests; saveLocal(); }
            return res.json({ success: true, leaveRequests: updateDoc.leaveRequests });
        } catch(e) { return res.status(500).json({ error: 'DB Error' }); }
    } else {
        if (!staffMember.leaveRequests) staffMember.leaveRequests = [];
        staffMember.leaveRequests.push(newRequest);
        saveLocal();
        return res.json({ success: true, leaveRequests: staffMember.leaveRequests });
    }
});

app.put('/api/staff/:id/leave-request/:leaveId', async (req, res) => {
    const { status } = req.body; // 'Approved' or 'Rejected'
    let staffMember = localDb.staff.find(s => s.id === req.params.id);
    if (isConnected) {
        try { staffMember = await Staff.findOne({ id: req.params.id }); } catch(e){}
    }
    if (!staffMember) return res.status(404).json({ error: 'Staff not found' });

    let doc = typeof staffMember.toObject === 'function' ? { ...staffMember.toObject() } : staffMember;
    if (!doc.leaveRequests) doc.leaveRequests = [];
    if (!doc.attendance) doc.attendance = [];

    const leaveIndex = doc.leaveRequests.findIndex(l => l.id === req.params.leaveId);
    if (leaveIndex === -1) return res.status(404).json({ error: 'Leave request not found' });

    doc.leaveRequests[leaveIndex].status = status;

    if (status === 'Approved') {
        const start = new Date(doc.leaveRequests[leaveIndex].startDate);
        const end = new Date(doc.leaveRequests[leaveIndex].endDate);
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            let existingAtt = doc.attendance.find(a => a.date === dateStr);
            if (!existingAtt) {
                doc.attendance.push({ date: dateStr, status: 'Absent', checkIn: '-', checkOut: '-' });
            } else {
                existingAtt.status = 'Absent';
            }
        }
    }

    if (isConnected) {
        try {
            await Staff.updateOne({ id: req.params.id }, { leaveRequests: doc.leaveRequests, attendance: doc.attendance });
        } catch(e) {}
    }
    const idx = localDb.staff.findIndex(s => s.id === req.params.id);
    if (idx !== -1) { 
        localDb.staff[idx].leaveRequests = doc.leaveRequests; 
        localDb.staff[idx].attendance = doc.attendance; 
        saveLocal(); 
    }
    return res.json({ success: true, leaveRequests: doc.leaveRequests, attendance: doc.attendance });
});

// Services
app.get('/api/services', async (req, res) => {
    if (isConnected) { try { return res.json(await Service.find()); } catch(e) {} }
    res.json(localDb.services);
});

app.post('/api/services', async (req, res) => {
    console.log('Received POST request for new service:', req.body);
    if (isConnected) { try { return res.json(await new Service(req.body).save()); } catch(e) {} }
    localDb.services.push(req.body); saveLocal(); res.json(req.body);
});

app.put('/api/services/:id', async (req, res) => {
    if (isConnected) { 
        try { 
            const updated = await Service.findOneAndUpdate(
                { $or: [{ id: req.params.id }, { name: req.params.id }] }, 
                req.body, 
                { new: true }
            );
            if (updated) return res.json(updated);
        } catch(e) {} 
    }
    const idx = localDb.services.findIndex(s => s.id === req.params.id || s.name === req.params.id);
    if (idx !== -1) { 
        localDb.services[idx] = { ...localDb.services[idx], ...req.body }; 
        saveLocal(); 
        return res.json(localDb.services[idx]); 
    }
    res.status(404).json({ error: 'Not found' });
});

app.delete('/api/services/:id', async (req, res) => {
    const idOrName = req.params.id;
    if (isConnected) { 
        try { 
            const deleted = await Service.findOneAndDelete({ $or: [{ id: idOrName }, { name: idOrName }] });
            if (deleted) return res.json({ message: 'Deleted' });
        } catch(e) {} 
    }
    const idx = localDb.services.findIndex(s => s.id === idOrName || s.name === idOrName);
    if (idx !== -1) { 
        localDb.services.splice(idx, 1); 
        saveLocal(); 
        return res.json({ message: 'Deleted' }); 
    }
    res.status(404).json({ error: 'Not found' });
});

// Inventory
app.get('/api/inventory', async (req, res) => {
    if (isConnected) { try { return res.json(await Inventory.find()); } catch(e) {} }
    res.json(localDb.inventory);
});
app.post('/api/inventory', async (req, res) => {
    if (isConnected) { try { return res.json(await new Inventory(req.body).save()); } catch(e) {} }
    localDb.inventory.push(req.body); saveLocal(); res.json(req.body);
});
app.put('/api/inventory/:id', async (req, res) => {
    if (isConnected) { 
        try { 
            const updated = await Inventory.findOneAndUpdate(
                { $or: [{ id: req.params.id }, { name: req.params.id }] }, 
                req.body, 
                { new: true }
            );
            if (updated) return res.json(updated);
        } catch(e) {} 
    }
    const idx = localDb.inventory.findIndex(i => i.id === req.params.id || i.name === req.params.id);
    if (idx !== -1) { 
        localDb.inventory[idx] = { ...localDb.inventory[idx], ...req.body }; 
        saveLocal(); 
        return res.json(localDb.inventory[idx]); 
    }
    res.status(404).json({ error: 'Not found' });
});

app.delete('/api/inventory/:id', async (req, res) => {
    if (isConnected) {
        try {
            await Inventory.deleteOne({ $or: [{ id: req.params.id }, { name: req.params.id }] });
            return res.json({ success: true });
        } catch(e) {}
    }
    const idx = localDb.inventory.findIndex(i => i.id === req.params.id || i.name === req.params.id);
    if (idx !== -1) {
        localDb.inventory.splice(idx, 1);
        saveLocal();
        return res.json({ success: true });
    }
    res.status(404).json({ error: 'Item not found' });
});

// Bookings
app.get('/api/bookings', async (req, res) => {
    let bookings = [];
    if (isConnected) { 
        try { bookings = await Booking.find(); } catch(e) {} 
    } else {
        bookings = localDb.bookings;
    }

    const now = new Date();
    let hasChanges = false;

    bookings.forEach(b => {
        const stat = (b.status || '').toLowerCase();
        if (['upcoming', 'confirmed', 'ongoing', 'pending', 'done'].includes(stat)) {
            const dateStrClean = b.date && b.date.includes('T') ? b.date.split('T')[0] : b.date;
            const apptStart = new Date(dateStrClean + 'T' + (b.time || '00:00'));
            const apptEnd = new Date(apptStart.getTime() + 60 * 60 * 1000);
            if (now > apptEnd) {
                b.status = 'Completed';
                hasChanges = true;
                if (isConnected && b.save) {
                    b.save().catch(()=>{});
                }
            }
            if (stat === 'done') {
                b.status = 'Completed';
                hasChanges = true;
                if (isConnected && b.save) {
                    b.save().catch(()=>{});
                }
            }
        }
    });

    if (hasChanges && !isConnected) saveLocal();
    res.json(bookings);
});
app.post('/api/bookings', async (req, res) => {
    let result = req.body;
    let saved = false;
    if (isConnected) { 
        try { 
            result = await new Booking(req.body).save(); 
            saved = true;
        } catch(e) {
            console.error("MongoDB save failed for new booking:", e.message);
        } 
    }
    localDb.bookings.push(req.body); 
    saveLocal(); 
    notifyLiveClients();
    res.json(result);
});
app.put('/api/bookings/:id', async (req, res) => {
    let currentBooking = localDb.bookings.find(b => b.id === req.params.id);
    let isStatusChangingToCompleted = false;
    
    if (isConnected) {
        try { currentBooking = await Booking.findOne({ id: req.params.id }); } catch(e){}
    }
    
    if (currentBooking && req.body.status && req.body.status.toLowerCase() === 'completed' && (!currentBooking.status || currentBooking.status.toLowerCase() !== 'completed')) {
        isStatusChangingToCompleted = true;
    }
    
    // Process consumables deduction if completing and not already deducted
    if (isStatusChangingToCompleted && !currentBooking.consumablesDeducted) {
        let cost = 0;
        const serviceIds = currentBooking.services || [];
        
        let allServices = localDb.services;
        let allInventory = localDb.inventory;
        if (isConnected) {
            try {
                allServices = await Service.find();
                allInventory = await Inventory.find();
            } catch(e){}
        }
        
        for (const svcId of serviceIds) {
            const svc = allServices.find(s => s.id === svcId || s.name === svcId);
            if (svc && svc.consumables && Array.isArray(svc.consumables)) {
                for (const c of svc.consumables) {
                    const invItem = allInventory.find(i => i.id === c.itemId);
                    if (invItem) {
                        cost += (Number(invItem.cost) || 0) * (Number(c.quantity) || 0);
                        // Deduct stock
                        invItem.stock = Math.max(0, (Number(invItem.stock) || 0) - (Number(c.quantity) || 0));
                        if (isConnected) {
                            try { await Inventory.updateOne({ id: invItem.id }, { stock: invItem.stock }); } catch(e){}
                        } else {
                            const idx = localDb.inventory.findIndex(i => i.id === invItem.id);
                            if (idx !== -1) localDb.inventory[idx].stock = invItem.stock;
                        }
                    }
                }
            }
        }
        
        req.body.consumablesCost = cost;
        req.body.consumablesDeducted = true;
        if (!isConnected) saveLocal();
    }
    
    if (isConnected) { 
        try { 
            const updated = await Booking.findOneAndUpdate({ id: req.params.id }, req.body, { new: true });
            notifyLiveClients();
            return res.json(updated); 
        } catch(e) {} 
    }
    const idx = localDb.bookings.findIndex(b => b.id === req.params.id);
    if (idx !== -1) { 
        localDb.bookings[idx] = { ...localDb.bookings[idx], ...req.body }; 
        saveLocal(); 
        notifyLiveClients();
        return res.json(localDb.bookings[idx]); 
    }
    res.status(404).json({ error: 'Not found' });
});

// Mock function for sending WhatsApp messages
async function sendWhatsAppConfirmation(phone, name) {
  console.log(`[WhatsApp API] Sending confirmation to ${phone} for ${name}...`);
  return new Promise(resolve => setTimeout(() => resolve({ success: true, messageId: 'msg_123' }), 500));
}

// New Appointment Confirmation Route
app.post('/api/bookings/:id/confirm', async (req, res) => {
    const { id } = req.params;
    const { customerName, customerPhone } = req.body;
    let updatedBooking = null;

    if (isConnected) {
        try {
            updatedBooking = await Booking.findOneAndUpdate(
                { $or: [{ id: id }, { _id: id }] },
                { status: 'Confirmed' },
                { new: true }
            );
        } catch(e) { console.error('DB Update Error:', e); }
    }

    const idx = localDb.bookings.findIndex(b => b.id === id || b._id === id);
    if (idx !== -1) {
        localDb.bookings[idx].status = 'Confirmed';
        saveLocal();
        if (!updatedBooking) updatedBooking = localDb.bookings[idx];
    }

    if (!updatedBooking) {
        return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    try {
        await sendWhatsAppConfirmation(customerPhone || updatedBooking.clientPhone || 'Unknown', customerName || updatedBooking.clientName || 'Client');
    } catch(err) {
        console.error('WhatsApp Error:', err);
    }

    notifyLiveClients();
    return res.status(200).json({ success: true, appointment: updatedBooking });
});

app.delete('/api/bookings/:id', async (req, res) => {
    const id = req.params.id;
    if (isConnected) {
        try {
            const result = await Booking.deleteOne({ $or: [{ id: id }, { _id: id }] });
            if (result.deletedCount > 0) {
                notifyLiveClients();
                return res.json({ success: true });
            }
        } catch(e) {}
    }
    const idx = localDb.bookings.findIndex(b => b.id === id || b._id === id);
    if (idx !== -1) {
        localDb.bookings.splice(idx, 1);
        saveLocal();
        notifyLiveClients();
        return res.json({ success: true });
    }
    res.status(404).json({ error: 'Booking not found' });
});

// Fallback POST route for deletion (more compatible with some firewalls)
app.post('/api/bookings/delete/:id', async (req, res) => {
    const id = req.params.id;
    if (isConnected) {
        try {
            const result = await Booking.deleteOne({ $or: [{ id: id }, { _id: id }] });
            if (result.deletedCount > 0) {
                notifyLiveClients();
                return res.json({ success: true });
            }
        } catch(e) {}
    }
    const idx = localDb.bookings.findIndex(b => b.id === id || b._id === id);
    if (idx !== -1) {
        localDb.bookings.splice(idx, 1);
        saveLocal();
        notifyLiveClients();
        return res.json({ success: true });
    }
    res.status(404).json({ error: 'Booking not found' });
});

// --- NEW: Payment Integration Routes ---
app.post('/api/payment/create-session', async (req, res) => {
    const { amount, bookingId, clientName } = req.body;
    
    // Check if keys are placeholders
    const isMock = !process.env.RAZORPAY_KEY_ID || 
                   process.env.RAZORPAY_KEY_ID.includes('YourKeyHere') || 
                   process.env.RAZORPAY_KEY_ID.includes('PASTE_YOUR_KEY');

    if (isMock) {
        console.log("Using Mock Payment Mode (No real keys found)");
        return res.json({ 
            orderId: "order_mock_" + Math.random().toString(36).substr(2, 9),
            amount: amount * 100,
            currency: "INR",
            key: "rzp_test_mockkey",
            isMock: true
        });
    }

    try {
        const options = {
            amount: amount * 100, // Razorpay works in paise (₹1 = 100 paise)
            currency: "INR",
            receipt: `receipt_${bookingId}`,
        };

        const order = await razorpay.orders.create(options);
        
        // Return order details for the frontend to use
        res.json({ 
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            key: razorpay.key_id // Send public key to frontend
        });
    } catch (err) {
        console.error("Razorpay Order Error:", err);
        res.status(500).json({ error: "Failed to create payment order. Check your keys." });
    }
});

app.post('/api/payment/verify', async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
        .createHmac("sha256", razorpay.key_secret)
        .update(body.toString())
        .digest("hex");

    if (expectedSignature === razorpay_signature) {
        // Payment verified! Update booking status
        // (You would normally find the booking by orderId metadata or receipt)
        res.json({ status: "success", message: "Payment verified successfully" });
    } else {
        res.status(400).json({ status: "failure", message: "Invalid signature" });
    }
});

// Events
app.get('/api/events', async (req, res) => {
    if (isConnected) { try { return res.json(await Event.find()); } catch(e) {} }
    res.json(localDb.events || []);
});
app.post('/api/events', async (req, res) => {
    if (isConnected) { try { return res.json(await new Event(req.body).save()); } catch(e) {} }
    if (!localDb.events) localDb.events = [];
    localDb.events.push(req.body); saveLocal(); res.json(req.body);
});
app.put('/api/events/:id', async (req, res) => {
    if (isConnected) { try { return res.json(await Event.findOneAndUpdate({ id: req.params.id }, req.body, { new: true })); } catch(e) {} }
    const idx = (localDb.events || []).findIndex(e => e.id === req.params.id);
    if (idx !== -1) { localDb.events[idx] = { ...localDb.events[idx], ...req.body }; saveLocal(); return res.json(localDb.events[idx]); }
    res.status(404).json({ error: 'Not found' });
});
app.delete('/api/events/:id', async (req, res) => {
    if (isConnected) { try { await Event.deleteOne({ id: req.params.id }); return res.json({ success: true }); } catch(e) {} }
    const idx = (localDb.events || []).findIndex(e => e.id === req.params.id);
    if (idx !== -1) { localDb.events.splice(idx, 1); saveLocal(); return res.json({ success: true }); }
    res.status(404).json({ error: 'Not found' });
});

// Expenses
app.get('/api/expenses', async (req, res) => {
    if (isConnected) { try { return res.json(await Expense.find()); } catch(e) {} }
    res.json(localDb.expenses || []);
});
app.post('/api/expenses', async (req, res) => {
    if (isConnected) { try { return res.json(await new Expense(req.body).save()); } catch(e) {} }
    if (!localDb.expenses) localDb.expenses = [];
    localDb.expenses.push(req.body); saveLocal(); res.json(req.body);
});
app.delete('/api/expenses/:id', async (req, res) => {
    const id = req.params.id;
    if (isConnected) { try { await Expense.deleteOne({ id: id }); return res.json({ success: true }); } catch(e) {} }
    if (!localDb.expenses) localDb.expenses = [];
    const idx = localDb.expenses.findIndex(x => x.id === id);
    if (idx !== -1) { localDb.expenses.splice(idx, 1); saveLocal(); return res.json({ success: true }); }
    res.status(404).json({ error: 'Not found' });
});

// Support Tickets API
app.get('/api/tickets', (req, res) => {
    res.json(localDb.tickets || []);
});

app.post('/api/tickets', (req, res) => {
    if (!localDb.tickets) localDb.tickets = [];
    // Prepend new tickets so they show up at the top
    localDb.tickets.unshift(req.body);
    saveLocal();
    res.json(req.body);
});

app.post('/api/tickets/reply/:id', (req, res) => {
    if (!localDb.tickets) localDb.tickets = [];
    const id = req.params.id;
    const { reply, status } = req.body;
    const ticket = localDb.tickets.find(t => t.id === id);
    if (ticket) {
        if (!ticket.replies) ticket.replies = [];
        ticket.replies.push(reply);
        if (status) ticket.status = status;
        saveLocal();
        return res.json(ticket);
    }
    res.status(404).json({ error: 'Ticket not found' });
});

app.put('/api/tickets/status/:id', (req, res) => {
    if (!localDb.tickets) localDb.tickets = [];
    const id = req.params.id;
    const { status } = req.body;
    const ticket = localDb.tickets.find(t => t.id === id);
    if (ticket) {
        ticket.status = status;
        saveLocal();
        return res.json(ticket);
    }
    res.status(404).json({ error: 'Ticket not found' });
});

// Seed
app.post('/api/seed', async (req, res) => {
    const { clients, staff, services, inventory, events } = req.body;
    if (isConnected) {
        try {
            if (clients) { await Client.deleteMany({}); await Client.insertMany(clients); }
            if (staff) { await Staff.deleteMany({}); await Staff.insertMany(staff); }
            if (services) { await Service.deleteMany({}); await Service.insertMany(services); }
            if (inventory) { await Inventory.deleteMany({}); await Inventory.insertMany(inventory); }
            if (events) { await Event.deleteMany({}); await Event.insertMany(events); }
        } catch (e) { console.error('Seed error:', e); }
    }
    if (clients) localDb.clients = clients;
    if (staff) localDb.staff = staff;
    if (services) localDb.services = services;
    if (inventory) localDb.inventory = inventory;
    if (events) localDb.events = events;
    saveLocal();
    res.json({ message: 'Success' });
});

// --- Admin Utilities (Combined from scratch scripts) ---
app.post('/api/admin/clear-bookings', async (req, res) => {
    localDb.bookings = [];
    saveLocal();
    if (isConnected) {
        try { await Booking.deleteMany({}); } catch (e) { console.error(e); }
    }
    res.json({ message: 'Bookings cleared successfully!' });
});

app.post('/api/admin/import-csv', (req, res) => {
    try {
        const csvPath = 'Services.csv';
        if (!fs.existsSync(csvPath)) return res.status(400).json({ error: 'Services.csv not found' });
        const csvData = fs.readFileSync(csvPath, 'utf8');
        const lines = csvData.split('\n').filter(l => l.trim() && !l.startsWith('Category,'));
        
        const icons = {
            'Eyebrow': '👁️', 'Threading': '🧵', 'Waxing': '🍯', 'Bleach': '✨',
            'De Tan': '☀️', 'Facial': '💆', 'Spa': '🛀', 'Manicures': '💅',
            'Pedicures': '🦶', 'Ear': '👂', 'Hair': '✂️', 'Make up': '💄',
            'Body': '🧖', 'Bride': '👑'
        };
        const getIcon = (cat) => {
            for (const key in icons) if (cat.toLowerCase().includes(key.toLowerCase())) return icons[key];
            return '✨';
        };

        const servicesMap = {};
        lines.forEach((line) => {
            const parts = line.split(',');
            const rawCat = parts[0].trim();
            const name = parts[1].trim();
            const variant = parts[2] ? parts[2].trim() : '';
            const priceStr = parts[3] ? parts[3].trim() : '';
            const price = priceStr ? parseFloat(priceStr) : 0;
            const key = rawCat + '|' + name;
            
            if (!servicesMap[key]) {
                servicesMap[key] = {
                    name: name, cat: rawCat, duration: 45, price: price,
                    prices: [], variants: [], icon: getIcon(rawCat), gender: 'unisex'
                };
            }
            servicesMap[key].prices.push(price);
            if (variant) servicesMap[key].variants.push(variant);
        });

        const newServices = Object.values(servicesMap).map((s, index) => {
            s.id = 'svc-' + (Date.now() + index);
            return s;
        });

        localDb.services = newServices;
        saveLocal();
        res.json({ message: 'Services updated successfully from CSV!', count: newServices.length });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/admin/seed-mongo', async (req, res) => {
    if (!isConnected) return res.status(500).json({ error: 'Not connected to MongoDB' });
    try {
        if (localDb.services && localDb.services.length > 0) {
            await Service.deleteMany({});
            await Service.insertMany(localDb.services);
            res.json({ message: `Successfully added ${localDb.services.length} services to MongoDB.` });
        } else {
            res.status(400).json({ error: 'No services found in localDb' });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- HTML Module Merger (Logic from merge.js) ---
app.post('/api/admin/merge-modules', (req, res) => {
    try {
        const targetFile = 'MedhikaArts_complete_module.html';
        const sourceFile = 'complete_module.html';
        const outputFile = 'MedhikaArts_complete_module_merged.html';

        if (!fs.existsSync(targetFile) || !fs.existsSync(sourceFile)) {
            return res.status(400).json({ error: 'Source or Target HTML files not found.' });
        }

        const f1 = fs.readFileSync(targetFile, 'utf8');
        const f2 = fs.readFileSync(sourceFile, 'utf8');

        // 1. Extract CSS
        const cssStart = f2.indexOf('/* Modal Tabs */');
        const cssEnd = f2.indexOf('</style>', cssStart);
        const extraCss = cssStart !== -1 ? f2.substring(cssStart, cssEnd) : '';

        // 2. Extract Notification Header
        const notifStart = f2.indexOf('<div class="notification-wrapper">');
        const notifEnd = f2.indexOf('<button class="btn"', notifStart);
        const notificationHtml = notifStart !== -1 ? f2.substring(notifStart, notifEnd) : '';

        // 3. Extract Ad Banner
        const adStart = f2.indexOf('<div class="ad-banner">');
        const adEnd = f2.indexOf('<div class="stats-grid">', adStart);
        const adHtml = adStart !== -1 ? f2.substring(adStart, adEnd) : '';

        // 4. Extract View Calendar
        const calStart = f2.indexOf('<!-- Full Calendar View -->');
        const calEnd = f2.indexOf('<div id="view-settings"', calStart);
        const calHtml = calStart !== -1 ? f2.substring(calStart, calEnd) : '';

        // 5. Extract Modals
        const modalsStart = f2.indexOf('<!-- Offers Modal -->');
        const modalsEnd = f2.indexOf('<script>', modalsStart);
        const modalsHtml = modalsStart !== -1 ? f2.substring(modalsStart, modalsEnd) : '';

        // 6. Extract JS Functions
        const jsStart = f2.indexOf('// Modal Functions');
        const jsEnd = f2.indexOf('</script>', jsStart);
        let extraJs = '';
        if (jsStart !== -1) {
            extraJs = f2.substring(jsStart, jsEnd);
        } else if (f2.indexOf('function toggleNotifications') !== -1) {
            extraJs = f2.substring(f2.indexOf('function toggleNotifications'), f2.indexOf('</script>', f2.indexOf('function toggleNotifications')));
        }

        let newF1 = f1;

        // Inject CSS
        if (extraCss) newF1 = newF1.replace('</style>', extraCss + '\n</style>');

        // Inject Notification Header
        const syncBtnPattern = /<button class="btn"\s+style="background: white; border: 1px solid var\(--border\); display: flex; align-items: center; gap: 8px;"\s+onclick="manualSync\(\)" id="sync-btn">/;
        if (notificationHtml) newF1 = newF1.replace(syncBtnPattern, notificationHtml + '\n<button class="btn" style="background: white; border: 1px solid var(--border); display: flex; align-items: center; gap: 8px;" onclick="manualSync()" id="sync-btn">');

        // Inject Ad Banner
        if (adHtml) newF1 = newF1.replace('<div class="stats-grid">', adHtml + '\n<div class="stats-grid">');

        // Inject View Calendar
        if (calHtml) newF1 = newF1.replace('<div id="view-settings"', calHtml + '\n<div id="view-settings"');

        // Inject Modals
        if (modalsHtml) newF1 = newF1.replace('<script>', modalsHtml + '\n<script>');

        // Inject JS Functions
        if (extraJs) newF1 = newF1.replace('</script>', '\n' + extraJs + '\n</script>');

        // Update nav to include full calendar if not present
        if (!newF1.includes('nav-calendar')) {
            newF1 = newF1.replace('<li class="nav-item" onclick="switchView(\'reports\')" id="nav-reports">Reports</li>', '<li class="nav-item" onclick="switchView(\'reports\')" id="nav-reports">Reports</li>\n                    <li class="nav-item" onclick="switchView(\'calendar\')" id="nav-calendar">Calendar</li>');
        }

        fs.writeFileSync(outputFile, newF1);
        res.json({ message: 'Modules merged successfully!', output: outputFile });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ==========================================
// --- WhatsApp Bulk Marketing API ---
// ==========================================

const { Client: WAClient, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

let whatsappClient = null;
let whatsappReady = false;
let latestQr = null; // Store the latest QR code string globally

// Initialize native automation client if provider is 'local' or default
const activeProvider = process.env.WHATSAPP_PROVIDER || 'local';

if (activeProvider === 'local') {
    whatsappClient = new WAClient({
        authStrategy: new LocalAuth(),
        puppeteer: {
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        }
    });

    whatsappClient.on('qr', (qr) => {
        latestQr = qr; // Save QR code
        console.log('========================================================================');
        console.log('📱 SCAN THIS QR CODE IN YOUR WHATSAPP TO ENABLE BACKGROUND AUTOMATION:');
        console.log('========================================================================');
        qrcode.generate(qr, {small: true});
    });

    whatsappClient.on('ready', () => {
        latestQr = null; // Clear QR code when connected
        console.log('========================================================================');
        console.log('🚀 WhatsApp Server API is READY! Automated messages will now send instantly.');
        console.log('========================================================================');
        whatsappReady = true;
    });

    whatsappClient.on('authenticated', () => {
        console.log('[WHATSAPP] Authenticated successfully!');
        latestQr = null;
    });

    whatsappClient.on('auth_failure', (msg) => {
        console.error('[WHATSAPP] Authentication failure:', msg);
        whatsappReady = false;
        latestQr = null;
    });

    whatsappClient.on('disconnected', (reason) => {
        console.log('[WHATSAPP] Client disconnected or logged out:', reason);
        whatsappReady = false;
        latestQr = null;
    });

    whatsappClient.initialize();
}

// 1. Media Upload Endpoint
app.post('/api/whatsapp/upload', (req, res) => {
    try {
        const { image } = req.body; // base64 string
        if (!image) return res.status(400).json({ error: 'No image data provided' });
        
        const matches = image.match(/^data:image\/([a-zA-Z0-9\/\+]+);base64,(.+)$/) || image.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
        if (!matches) return res.status(400).json({ error: 'Invalid base64 image format' });
        
        const ext = matches[1].split('/')[1] || matches[1];
        const data = Buffer.from(matches[2], 'base64');
        const fileName = `marketing_${Date.now()}.${ext}`;
        const filePath = path.join(uploadsDir, fileName);
        
        fs.writeFileSync(filePath, data);
        
        // Generate a public URL
        const host = req.headers.host || `localhost:${PORT}`;
        const protocol = req.headers['x-forwarded-proto'] || 'http';
        const publicUrl = process.env.SERVER_PUBLIC_URL 
            ? `${process.env.SERVER_PUBLIC_URL}/uploads/${fileName}` 
            : `${protocol}://${host}/uploads/${fileName}`;
            
        console.log(`[MEDIA UPLOAD] Saved base64 to ${filePath} -> Public URL: ${publicUrl}`);
        res.json({ success: true, url: publicUrl, fileName });
    } catch (err) {
        console.error('[ERROR] Media upload failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// 2. Trigger Bulk Campaign
app.post('/api/whatsapp/send-bulk', async (req, res) => {
    try {
        const { name, recipients, message, mediaUrls } = req.body;
        if (!name || !recipients || !Array.isArray(recipients) || !message) {
            return res.status(400).json({ error: 'Invalid campaign details. Required fields: name, recipients (array), message.' });
        }
        
        const campaignId = `cmp-${Date.now()}`;
        const campaign = {
            id: campaignId,
            name: name,
            message: message,
            mediaUrls: mediaUrls || [],
            recipientsCount: recipients.length,
            status: 'processing',
            timestamp: new Date().toISOString(),
            results: []
        };
        
        // Save initially to localDb
        localDb.campaigns.push(campaign);
        saveLocal();
        
        if (isConnected) {
            try { 
                await new Campaign(campaign).save(); 
            } catch (e) { 
                console.error('[ERROR] MongoDB campaign save failed:', e); 
            }
        }
        
        // Respond immediately to front-end to prevent HTTP timeout
        res.json({ success: true, campaignId, message: 'Campaign started in background', recipientsCount: recipients.length });
        
        // Start background worker
        processCampaignBackground(campaignId, recipients, message, mediaUrls);
    } catch (err) {
        console.error('[ERROR] Failed to launch campaign:', err);
        res.status(500).json({ error: err.message });
    }
});

// --- NEW: Direct Bulk Message & Photo API ---
app.post('/api/whatsapp/send-direct-bulk', async (req, res) => {
    try {
        const { recipients, message, mediaUrl, mediaBase64, delayMs } = req.body;
        
        if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
            return res.status(400).json({ error: 'Recipients must be a non-empty array of objects or strings.' });
        }
        if (!message) {
            return res.status(400).json({ error: 'Message content is required.' });
        }

        let resolvedMediaUrls = [];

        // 1. If base64 photo is provided, save it locally and generate a public URL
        if (mediaBase64) {
            const matches = mediaBase64.match(/^data:image\/([a-zA-Z0-9\/\+]+);base64,(.+)$/) || mediaBase64.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
            if (!matches) {
                return res.status(400).json({ error: 'Invalid base64 image format' });
            }
            const ext = matches[1].split('/')[1] || matches[1];
            const data = Buffer.from(matches[2], 'base64');
            const fileName = `direct_marketing_${Date.now()}.${ext}`;
            const filePath = path.join(uploadsDir, fileName);
            
            fs.writeFileSync(filePath, data);
            
            const host = req.headers.host || `localhost:${PORT}`;
            const protocol = req.headers['x-forwarded-proto'] || 'http';
            const publicUrl = process.env.SERVER_PUBLIC_URL 
                ? `${process.env.SERVER_PUBLIC_URL}/uploads/${fileName}` 
                : `${protocol}://${host}/uploads/${fileName}`;
                
            resolvedMediaUrls.push(publicUrl);
            console.log(`[DIRECT MEDIA UPLOAD] Saved base64 to ${filePath} -> Public URL: ${publicUrl}`);
        } else if (mediaUrl) {
            resolvedMediaUrls.push(mediaUrl);
        }

        // 2. Normalize recipients to ensure name and phone are parsed correctly
        const normalizedRecipients = recipients.map((r, index) => {
            const phoneStr = typeof r === 'string' ? r : (r.phone || r.number || '');
            const nameStr = typeof r === 'object' ? (r.name || 'Client') : `Client ${index + 1}`;
            return { name: nameStr, phone: phoneStr };
        });

        // 3. Create a campaign record so it displays in dashboard lists
        const campaignId = `direct-cmp-${Date.now()}`;
        const campaign = {
            id: campaignId,
            name: `Direct Bulk Sending - ${new Date().toLocaleDateString()}`,
            message: message,
            mediaUrls: resolvedMediaUrls,
            recipientsCount: normalizedRecipients.length,
            status: 'processing',
            timestamp: new Date().toISOString(),
            results: []
        };
        
        localDb.campaigns.push(campaign);
        saveLocal();
        
        if (isConnected) {
            try { 
                await new Campaign(campaign).save(); 
            } catch (e) { 
                console.error('[ERROR] MongoDB direct campaign save failed:', e); 
            }
        }

        // 4. Start the corrected background queue processor
        const delay = delayMs ? parseInt(delayMs, 10) : parseInt(process.env.WHATSAPP_SEND_DELAY_MS || '2000', 10);
        processCampaignBackground(campaignId, normalizedRecipients, message, resolvedMediaUrls);

        // 5. Respond immediately to caller
        res.json({
            success: true,
            campaignId,
            message: 'Direct bulk messages are being sent in the background.',
            recipientsCount: normalizedRecipients.length,
            mediaUrls: resolvedMediaUrls,
            statusUrl: `/api/whatsapp/campaign/${campaignId}`
        });

    } catch (err) {
        console.error('[ERROR] Direct bulk sending API error:', err);
        res.status(500).json({ error: err.message });
    }
});

// New: WhatsApp Status & QR Code Endpoint
app.get('/api/whatsapp/status', (req, res) => {
    res.json({
        provider: activeProvider,
        ready: whatsappReady,
        qr: latestQr
    });
});

// New: Reroute API to the WhatsApp bulk messaging dashboard page
app.get('/api/whatsapp/dashboard', (req, res) => {
    res.redirect('/whatsapp.html');
});

// 3. Get Campaign Status
app.get('/api/whatsapp/campaign/:id', (req, res) => {
    const campaign = localDb.campaigns.find(c => c.id === req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    res.json(campaign);
});

// 4. Get All Campaigns
app.get('/api/whatsapp/campaigns', (req, res) => {
    res.json(localDb.campaigns || []);
});

// Background queue processor
async function processCampaignBackground(campaignId, recipients, messageTemplate, mediaUrls) {
    console.log(`[CAMPAIGN START] ID: ${campaignId} with ${recipients.length} recipients`);
    
    const provider = process.env.WHATSAPP_PROVIDER || 'local';
    const delay = parseInt(process.env.WHATSAPP_SEND_DELAY_MS || '2000', 10);
    const salonName = 'MedhikaArts Salon';
    
    const getCampaign = () => localDb.campaigns.find(c => c.id === campaignId);
    
    const updateCampaignState = async (updatedFields) => {
        const cmp = getCampaign();
        if (cmp) {
            Object.assign(cmp, updatedFields);
            saveLocal();
            if (isConnected) {
                try {
                    await Campaign.updateOne({ id: campaignId }, updatedFields);
                } catch (e) {
                    console.error('MongoDB update campaign failed:', e);
                }
            }
        }
    };
    
    // If using local provider, check if ready, and wait up to 5 minutes if not
    if (provider === 'local' && (!whatsappReady || !whatsappClient)) {
        console.log(`[CAMPAIGN WAIT] WhatsApp client not ready. Waiting for user authentication...`);
        let waitTimeMs = 0;
        const maxWaitTimeMs = 5 * 60 * 1000; // 5 minutes
        const checkIntervalMs = 3000; // 3 seconds
        
        await updateCampaignState({ status: 'waiting_for_whatsapp' });
        
        while (!whatsappReady || !whatsappClient) {
            if (waitTimeMs >= maxWaitTimeMs) {
                console.error(`[CAMPAIGN TIMEOUT] WhatsApp client was not authenticated within 5 minutes.`);
                const results = recipients.map(recipient => ({
                    name: recipient.name,
                    phone: recipient.phone,
                    status: 'failed',
                    error: 'WhatsApp client connection timed out. Please scan the QR code and try again.',
                    timestamp: new Date().toISOString()
                }));
                await updateCampaignState({ status: 'failed', results });
                return;
            }
            
            await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
            waitTimeMs += checkIntervalMs;
            
            // Check if campaign was canceled or deleted in the meantime
            const currentCmp = getCampaign();
            if (!currentCmp || currentCmp.status === 'canceled' || currentCmp.status === 'failed') {
                console.log(`[CAMPAIGN CANCELED] Campaign ${campaignId} was canceled while waiting for WhatsApp client.`);
                return;
            }
        }
        
        console.log(`[CAMPAIGN RESUME] WhatsApp client connected! Starting campaign.`);
        await updateCampaignState({ status: 'processing' });
    }

    let sentCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < recipients.length; i++) {
        const recipient = recipients[i];
        const personalizedMsg = messageTemplate
            .replace(/{name}/g, recipient.name)
            .replace(/{salon}/g, salonName);
            
        let phone = recipient.phone.replace(/\D/g, '');
        if (phone.length === 10) phone = '91' + phone;
        
        let success = false;
        let errorMsg = null;
        
        try {
            if (provider === 'local') {
                // --- Provider: Native WhatsApp Automation (whatsapp-web.js) ---
                if (!whatsappReady || !whatsappClient) {
                    throw new Error('Native WhatsApp Client is not scanned/ready yet. Please check the server console.');
                }
                
                const chatId = phone.startsWith('91') ? `${phone}@c.us` : `91${phone}@c.us`;
                
                // If there is media, send it with the message as its caption
                if (mediaUrls && mediaUrls.length > 0) {
                    for (let m = 0; m < mediaUrls.length; m++) {
                        try {
                            const media = await MessageMedia.fromUrl(mediaUrls[m]);
                            // Set the caption only on the first media item
                            const options = m === 0 ? { caption: personalizedMsg } : {};
                            await whatsappClient.sendMessage(chatId, media, options);
                        } catch (mediaErr) {
                            console.error(`[LOCAL SEND] Failed to fetch/send media from ${mediaUrls[m]} for ${phone}:`, mediaErr);
                            // Fallback: if the first media item fails, send the text message separately
                            if (m === 0) {
                                await whatsappClient.sendMessage(chatId, personalizedMsg);
                            }
                        }
                    }
                } else {
                    // No media, send plain text message
                    await whatsappClient.sendMessage(chatId, personalizedMsg);
                }
                
                success = true;
                console.log(`[LOCAL SEND] Successfully auto-sent message to ${recipient.name} (${phone})`);
                await new Promise(resolve => setTimeout(resolve, delay)); // Respect delay

            } else if (provider === 'mock') {
                // Simulate sending with realistic delay
                await new Promise(resolve => setTimeout(resolve, delay));
                success = true;
                console.log(`[MOCK SEND] Sent message to ${recipient.name} (${phone})`);
            } else if (provider === 'ultramsg') {
                const axios = require('axios');
                const instanceId = process.env.ULTRAMSG_INSTANCE_ID;
                const token = process.env.ULTRAMSG_TOKEN;
                
                if (!instanceId || !token) throw new Error('UltraMsg credentials missing in .env');
                
                const hasMedia = mediaUrls && mediaUrls.length > 0;
                const url = hasMedia 
                    ? `https://api.ultramsg.com/${instanceId}/messages/image`
                    : `https://api.ultramsg.com/${instanceId}/messages/chat`;
                    
                const data = hasMedia ? {
                    token: token,
                    to: phone,
                    image: mediaUrls[0],
                    caption: personalizedMsg
                } : {
                    token: token,
                    to: phone,
                    body: personalizedMsg
                };
                
                const response = await axios.post(url, data);
                if (response.data && (response.data.sent === 'true' || response.data.success)) {
                    success = true;
                } else {
                    throw new Error(JSON.stringify(response.data));
                }
            } else if (provider === 'twilio') {
                const axios = require('axios');
                const sid = process.env.TWILIO_ACCOUNT_SID;
                const authToken = process.env.TWILIO_AUTH_TOKEN;
                const from = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';
                
                if (!sid || !authToken) throw new Error('Twilio credentials missing in .env');
                
                const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
                
                const params = new URLSearchParams();
                params.append('To', `whatsapp:+${phone}`);
                params.append('From', from);
                params.append('Body', personalizedMsg);
                if (mediaUrls && mediaUrls.length > 0) {
                    params.append('MediaUrl', mediaUrls[0]);
                }
                
                const authHeader = 'Basic ' + Buffer.from(`${sid}:${authToken}`).toString('base64');
                const response = await axios.post(url, params, {
                    headers: {
                        'Authorization': authHeader,
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                });
                
                if (response.data && response.data.sid) {
                    success = true;
                } else {
                    throw new Error('Twilio API call completed but failed to verify SID.');
                }
            } else if (provider === 'cloud_api') {
                const axios = require('axios');
                const phoneId = process.env.META_PHONE_NUMBER_ID;
                const token = process.env.META_ACCESS_TOKEN;
                
                if (!phoneId || !token) throw new Error('Meta Cloud API credentials missing in .env');
                
                const url = `https://graph.facebook.com/v17.0/${phoneId}/messages`;
                
                const data = {
                    messaging_product: "whatsapp",
                    recipient_type: "individual",
                    to: phone,
                    type: "text",
                    text: { body: personalizedMsg }
                };
                
                if (mediaUrls && mediaUrls.length > 0) {
                    data.type = "image";
                    data.image = {
                        link: mediaUrls[0],
                        caption: personalizedMsg
                    };
                    delete data.text;
                }
                
                const response = await axios.post(url, data, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (response.data && response.data.messages && response.data.messages[0]) {
                    success = true;
                } else {
                    throw new Error(JSON.stringify(response.data));
                }
            } else {
                throw new Error(`Unsupported provider: ${provider}`);
            }
            
            sentCount++;
        } catch (err) {
            success = false;
            errorMsg = err.message || 'Unknown error occurred';
            failCount++;
            console.error(`[CAMPAIGN ERROR] Failed sending to ${recipient.name}:`, errorMsg);
        }
        
        // Add to result list
        const cmp = getCampaign();
        if (cmp) {
            const results = [...cmp.results, {
                name: recipient.name,
                phone: phone,
                status: success ? 'sent' : 'failed',
                error: errorMsg,
                timestamp: new Date().toISOString()
            }];
            await updateCampaignState({ results });
        }
        
        // Throttle subsequent sends
        if (i < recipients.length - 1) {
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    // Set final status
    const finalStatus = failCount === 0 ? 'completed' : (sentCount === 0 ? 'failed' : 'completed_with_errors');
    await updateCampaignState({ status: finalStatus });
    console.log(`[CAMPAIGN COMPLETED] ID: ${campaignId}. Status: ${finalStatus}. Sent: ${sentCount}, Failed: ${failCount}`);
}

// --- AI Chatbot Assistant Endpoint ---
app.post('/api/ai/chat', async (req, res) => {
    const { message } = req.body;
    if (!message) {
        return res.status(400).json({ error: 'Message is required' });
    }

    const query = message.toLowerCase().trim();
    let reply = "";
    let command = null;
    let data = null;

    // Check if Gemini API key exists for live LLM response
    const geminiApiKey = process.env.GEMINI_API_KEY;

    try {
        if (geminiApiKey) {
            try {
                const axios = require('axios');
                
                // --- RAG CONTEXT INJECTION BUILDER ---
                const currentTime = new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeStyle: 'short' }).format(new Date());
                
                const appointmentsToday = (localDb.bookings || []).length;
                const revenueToday = (localDb.bookings || []).reduce((sum, b) => sum + (b.total || 0), 0);
                
                const lowStockAlerts = (localDb.inventory || [])
                    .filter(i => (i.quantity || i.stock || 0) < 5)
                    .map(i => ({ name: i.name, current: (i.quantity || i.stock), unit: "units" }));
                
                // For demonstration, map actual staff statuses
                const staffAvailability = {};
                (localDb.staff || []).forEach(s => {
                    staffAvailability[s.name] = (s.status === 'Active' || s.status === 'Available') ? 'Available' : (s.status || 'Busy');
                });

                const dashboardDataSnapshot = {
                    system_time: currentTime,
                    active_appointments_today: appointmentsToday,
                    revenue_today_inr: revenueToday,
                    critical_alerts: {
                        low_stock: lowStockAlerts,
                        late_clients: []
                    },
                    staff_availability_next_60_mins: staffAvailability
                };

                const systemContext = `[LIVE_DASHBOARD_DATA_SNAPSHOT]
${JSON.stringify(dashboardDataSnapshot, null, 2)}

[SYSTEM INSTRUCTIONS]
You are Maya ("Medhika Arts Your Assistant"), the executive-level live digital assistant for the MedhikaArts Salon Management System.

### CORE DATA DIRECTIVE (NO HALLUCINATIONS)
- **Data-Bounded Truth:** You must answer every single user query using *only* the real-time context provided in the \`[LIVE_DASHBOARD_DATA_SNAPSHOT]\` above. 
- If the user asks about a client, appointment, staff member, or inventory item that is completely missing from the snapshot, you must explicitly state that the data is not available in your current dashboard state. Do NOT make up, assume, or hallucinate placeholder data.

### BEHAVIORAL DIRECTIVES (THE "POSITIVE & PRO" RULE)
- **Solution-Oriented Positivity:** Even when delivering negative business data (e.g., low stock, canceled appointments, or zero availability), you must frame the response positively and immediately offer an actionable solution. Never just say "We are out of stock" or "No one is free."
- **Tone & Style:** Maintain a highly professional, enthusiastic, supportive, and premium hospitality tone. Use active verbs.
- **Formatting:** Keep answers scannable for busy managers. Use **bolding** for key data points (names, times, numbers) and short bullet points when listing multiple items. 

### CONVERSATIONAL BLUEPRINTS
Follow these structural examples when dealing with negative data:
- **Low Inventory:** "We are having a fantastic week for color services! Because of that high demand, our **Luxury Hair Color** is down to its last **6 units**. I can open the inventory order sheet or draft a restocking request for you right now so we stay fully supplied. Should we do that?"
- **No Availability:** "Our team is completely fully booked at 3:00 PM today—which is great for business! To accommodate your client, I see that **Sneha** has a perfect opening open up just a bit earlier at **2:30 PM**, and **Aryan** is completely free starting at **4:15 PM**. Would you like me to hold one of those spots on the calendar?"

[USER QUERY]
"${message}"`;

                const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${geminiApiKey}`;
                const response = await axios.post(url, {
                    contents: [{ parts: [{ text: systemContext }] }]
                }, { timeout: 8000 });

                if (response.data && response.data.candidates && response.data.candidates[0].content.parts[0].text) {
                    reply = response.data.candidates[0].content.parts[0].text;
                }
            } catch (err) {
                console.error('[GEMINI ERROR] Falling back to local NLP rules:', err.message);
            }
        }

        // Hybrid Command Processor (sets navigation/templates even if Gemini generated the reply)
        if (query.includes('go to marketing') || query.includes('switch to marketing') || query.includes('open marketing')) {
            if (!reply) reply = "Certainly! I've switched your dashboard to the **Marketing Hub** tab where you can design templates, select target audiences, and queue broadcast campaigns.";
            command = "switchView_marketing";
        } else if (query.includes('go to staff') || query.includes('switch to staff') || query.includes('open staff') || query.includes('show staff')) {
            if (!reply) reply = "Sure! Switching you over to the **Team Management** view to manage your stylists, configure commission rates, or track payouts.";
            command = "switchView_staff";
        } else if (query.includes('go to booking') || query.includes('switch to booking') || query.includes('open bookings') || query.includes('show bookings')) {
            if (!reply) reply = "Right away. I've toggled the view to **Booking Management** where you can view live schedules, modify slots, and manage reception check-ins.";
            command = "switchView_bookings";
        } else if (query.includes('go to calendar') || query.includes('switch to calendar') || query.includes('open calendar') || query.includes('show calendar')) {
            if (!reply) reply = "Switched to **Salon Calendar** tab. You can view all appointments mapped across interactive monthly/weekly grids.";
            command = "switchView_calendar";
        } else if (query.includes('go to client') || query.includes('switch to client') || query.includes('open clients') || query.includes('show clients')) {
            if (!reply) reply = "Toggled to the **Client Directory** to search, audit, or register customer profiles.";
            command = "switchView_clients";
        } else if (query.includes('go to inventory') || query.includes('switch to inventory') || query.includes('open inventory') || query.includes('show inventory')) {
            if (!reply) reply = "Switched to **Inventory Control** to oversee styling products, stock limits, and suppliers.";
            command = "switchView_inventory";
        } else if (query.includes('go to report') || query.includes('switch to report') || query.includes('open reports') || query.includes('show reports')) {
            if (!reply) reply = "Opening **Business Reports** view for insights on revenue, staff stats, and top-selling services.";
            command = "switchView_reports";
        } else if (query.includes('go to setting') || query.includes('switch to setting') || query.includes('open settings') || query.includes('show settings')) {
            if (!reply) reply = "Opening **System Settings** page to configure branch profiles, taxes, and system configurations.";
            command = "switchView_settings";
        }

        // If Gemini is not set or failed to respond, run our high-fidelity rule-based processor:
        if (!reply) {
        // 1. Navigation Commands
        if (query.includes('go to marketing') || query.includes('switch to marketing') || query.includes('open marketing')) {
            reply = "Certainly! I've switched your dashboard to the **Marketing Hub** tab where you can design templates, select target audiences, and queue broadcast campaigns.";
            command = "switchView_marketing";
        } else if (query.includes('go to staff') || query.includes('switch to staff') || query.includes('open staff') || query.includes('show staff')) {
            reply = "Sure! Switching you over to the **Team Management** view to manage your stylists, configure commission rates, or track payouts.";
            command = "switchView_staff";
        } else if (query.includes('go to booking') || query.includes('switch to booking') || query.includes('open bookings') || query.includes('show bookings')) {
            reply = "Right away. I've toggled the view to **Booking Management** where you can view live schedules, modify slots, and manage reception check-ins.";
            command = "switchView_bookings";
        } else if (query.includes('go to calendar') || query.includes('switch to calendar') || query.includes('open calendar') || query.includes('show calendar')) {
            reply = "Switched to **Salon Calendar** tab. You can view all appointments mapped across interactive monthly/weekly grids.";
            command = "switchView_calendar";
        } else if (query.includes('go to client') || query.includes('switch to client') || query.includes('open clients') || query.includes('show clients')) {
            reply = "Toggled to the **Client Directory** to search, audit, or register customer profiles.";
            command = "switchView_clients";
        } else if (query.includes('go to inventory') || query.includes('switch to inventory') || query.includes('open inventory') || query.includes('show inventory')) {
            reply = "Switched to **Inventory Control** to oversee styling products, stock limits, and suppliers.";
            command = "switchView_inventory";
        } else if (query.includes('go to report') || query.includes('switch to report') || query.includes('open reports') || query.includes('show reports')) {
            reply = "Opening **Business Reports** view for insights on revenue, staff stats, and top-selling services.";
            command = "switchView_reports";
        } else if (query.includes('go to setting') || query.includes('switch to setting') || query.includes('open settings') || query.includes('show settings')) {
            reply = "Opening **System Settings** page to configure branch profiles, taxes, and system configurations.";
            command = "switchView_settings";
        }

        // 2. Data Queries (Accessing localDb)
        else if (query.includes('how many client') || query.includes('client count') || query.includes('number of clients')) {
            const count = localDb.clients ? localDb.clients.length : 0;
            const vipCount = localDb.clients ? localDb.clients.filter(c => c.category && c.category.toLowerCase().includes('vip')).length : 0;
            reply = `📊 **Client Database Summary**:\n- Total registered clients: **${count}**\n- VIP clients: **${vipCount}**\n- Regular clients: **${count - vipCount}**\n\nYou can view details in the **Clients** tab.`;
        } 
        
        else if (query.includes('sales') || query.includes('revenue') || query.includes('income') || query.includes('earnings') || query.includes('how much we made')) {
            const bookings = localDb.bookings || [];
            const count = bookings.length;
            const total = bookings.reduce((sum, b) => sum + (b.total || 0), 0);
            const formattedTotal = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(total);
            reply = `💰 **Financial Intelligence Report**:\n- Total Recorded Bookings: **${count}**\n- Cumulative Sales Revenue: **${formattedTotal}**\n- Average Basket Value: **${count ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(total / count) : '₹0'}**`;
        }

        else if (query.includes('top spender') || query.includes('best customer') || query.includes('most spent')) {
            const bookings = localDb.bookings || [];
            const clients = localDb.clients || [];
            
            if (bookings.length === 0 || clients.length === 0) {
                reply = "I audited the databases, but there are no historical bookings recorded yet to determine your top spender.";
            } else {
                // Calculate spends per client
                const spends = {};
                bookings.forEach(b => {
                    const clientName = b.clientName || 'Unknown';
                    spends[clientName] = (spends[clientName] || 0) + (b.total || 0);
                });

                let topClient = '';
                let maxSpend = 0;
                for (const [name, spend] of Object.entries(spends)) {
                    if (spend > maxSpend) {
                        maxSpend = spend;
                        topClient = name;
                    }
                }

                const clientDetails = clients.find(c => c.name.toLowerCase() === topClient.toLowerCase()) || {};
                const formattedSpend = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(maxSpend);
                
                reply = `💎 **Top Customer Analysis**:\nOur top-spending client is **${topClient}** with a cumulative spend of **${formattedSpend}** across styling packages!\n\n**Client details**:\n- Phone: ${clientDetails.phone || 'N/A'}\n- Gender: ${clientDetails.gender || 'N/A'}\n- Segment Tag: ${clientDetails.category || 'Standard'}`;
            }
        }

        else if (query.includes('top staff') || query.includes('best employee') || query.includes('stylist stats') || query.includes('staff sales')) {
            const bookings = localDb.bookings || [];
            const staff = localDb.staff || [];

            if (bookings.length === 0 || staff.length === 0) {
                reply = "I looked at the booking history, but there are no recorded employee metrics to display performance stats yet.";
            } else {
                const performances = {};
                bookings.forEach(b => {
                    if (b.staffId) {
                        performances[b.staffId] = (performances[b.staffId] || 0) + (b.total || 0);
                    }
                });

                let bestStaffId = null;
                let maxSales = 0;
                for (const [id, sales] of Object.entries(performances)) {
                    if (sales > maxSales) {
                        maxSales = sales;
                        bestStaffId = id;
                    }
                }

                const bestStylist = staff.find(s => s.id === bestStaffId) || {};
                const stylistName = bestStylist.name || 'Unknown Stylist';
                const formattedSales = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(maxSales);

                reply = `💇 **Stylist Performance Leaderboard**:\nOur top styling artist is **${stylistName}** who drove **${formattedSales}** in direct salon treatment sales!\n\n**Stylist summary**:\n- Current Commission Rate: **${bestStylist.commissionRate || 10}%**\n- Payout Status: **${bestStylist.payoutStatus || 'Pending'}**\n- Role/Specialty: Senior Hair Specialist`;
            }
        }

        else if (query.includes('inventory') || query.includes('stock') || query.includes('low stock')) {
            const items = localDb.inventory || [];
            const lowStockItems = items.filter(i => (i.quantity || i.stock || 0) < 5);
            
            if (items.length === 0) {
                reply = "Your inventory list is currently empty. You can register styling items under the **Inventory** tab!";
            } else if (lowStockItems.length === 0) {
                reply = `📦 **Inventory Stock Report**:\nAll **${items.length}** styling products are currently healthy and well above safety thresholds. No low-stock items detected!`;
            } else {
                const list = lowStockItems.map(i => `- **${i.name}**: only **${i.quantity || i.stock}** units remaining`).join('\n');
                reply = `⚠️ **Critical Low Stock Alert**:\nThe following **${lowStockItems.length}** products are critically running low (under 5 units):\n\n${list}\n\nShall I open the Inventory Control view so you can update stock or draft a purchase order?`;
                command = "switchView_inventory";
            }
        }

        // 3. Campaign & Template Generators
        else if (query.includes('campaign') || query.includes('template') || query.includes('write message') || query.includes('promo')) {
            if (query.includes('welcome') || query.includes('gift') || query.includes('new client')) {
                reply = `👋 **Welcome Campaign Template Generated**:\n\n"Hello {name}! ✨ We are thrilled to welcome you to the {salon} family. To make your first visit extra special, here is a custom welcome gift: enjoy **15% OFF** on any premium hair styling or skincare treatment this week! 💇‍♀️\n\nBook a slot today or show this message at checkout. We look forward to pampering you!\n\nWarm regards,\n{salon} Team"`;
                command = "setCampaignMessage";
                data = {
                    name: "Welcome Gift Campaign",
                    message: "Hello {name}! ✨ We are thrilled to welcome you to the {salon} family. To make your first visit extra special, here is a custom welcome gift: enjoy 15% OFF on any premium hair styling or skincare treatment this week! 💇‍♀️\n\nBook a slot today or show this message at checkout. We look forward to pampering you!\n\nWarm regards,\n{salon} Team"
                };
            } else if (query.includes('festival') || query.includes('diwali') || query.includes('festive') || query.includes('holiday')) {
                reply = `✨ **Festive Glow Campaign Template Generated**:\n\n"Hello {name}! 🌟 Celebrate the festive season with a gorgeous makeover. MedhikaArts has prepared premium Festive Packages starting at just ₹999 (Keratin Spa + Hydrating Facial + Glow Mani-Pedi)! 💅\n\nSlots are filling up rapidly this week. Tap to book your festive glow now!\n\nHappy Holidays from {salon}!"`;
                command = "setCampaignMessage";
                data = {
                    name: "Festive Glow Special",
                    message: "Hello {name}! 🌟 Celebrate the festive season with a gorgeous makeover. MedhikaArts has prepared premium Festive Packages starting at just ₹999 (Keratin Spa + Hydrating Facial + Glow Mani-Pedi)! 💅\n\nSlots are filling up rapidly this week. Tap to book your festive glow now!\n\nHappy Holidays from {salon}!"
                };
            } else if (query.includes('inactive') || query.includes('miss you') || query.includes('we miss you')) {
                reply = `💔 **Re-engagement Campaign Template Generated**:\n\n"Hello {name}! We haven't seen you around the styling chairs at {salon} lately. We miss pampering you! 💆‍♀️\n\nBook an appointment in the next 7 days and claim a **FREE relaxing scalp massage** with any hair service of your choice!\n\nBook now: {salon}"`;
                command = "setCampaignMessage";
                data = {
                    name: "Re-engagement Campaign",
                    message: "Hello {name}! We haven't seen you around the styling chairs at {salon} lately. We miss pampering you! 💆‍♀️\n\nBook an appointment in the next 7 days and claim a FREE relaxing scalp massage with any hair service of your choice!\n\nBook now: {salon}"
                };
            } else {
                // Default weekend pampering template
                reply = `💅 **Weekend Pampering Campaign Template Generated**:\n\n"Hello {name}! 🌸 Prepare for the weekend with our exclusive Friday Pampering specials. Treat yourself to a premium haircut, blowout, or relaxing manicure at **10% OFF**!\n\nUnwind, relax, and look your absolute best.\n\nReply to book your weekend slot at {salon}!"`;
                command = "setCampaignMessage";
                data = {
                    name: "Weekend Pampering Special",
                    message: "Hello {name}! 🌸 Prepare for the weekend with our exclusive Friday Pampering specials. Treat yourself to a premium haircut, blowout, or relaxing manicure at 10% OFF!\n\nUnwind, relax, and look your absolute best.\n\nReply to book your weekend slot at {salon}!"
                };
            }
            reply += `\n\n*Click the **'Use in Marketing'** button that just appeared in your chat box to auto-load this directly into the Campaign Composer!*`;
        }

        // 4. Marketing Strategies & Business Tips
        else if (query.includes('retention') || query.includes('loyalty') || query.includes('customer lifetime') || query.includes('keep client')) {
            reply = `💡 **Top 5 Salon Customer Retention Strategies**:\n\n1. **Rebook at Checkout**: Stylists should always suggest a follow-up booking window immediately after services (e.g. "To maintain this color, let's secure a touch-up in 5 weeks").\n2. **Personalized Follow-Ups**: Configure WhatsApp automations to send a friendly message 3 days post-treatment asking how they are loving their look.\n3. **VIP Tier Programs**: Flag high-spending clients (e.g., spending over ₹5,000) and reward them with complimentary conditioning upgrades.\n4. **Consistent Marketing Broadcasts**: Run regular campaigns (Welcome, Inactive, Festive) using the **Marketing Hub** to stay top of mind.\n5. **Stylist Bonding**: Educate stylists on note-taking. Remembering personal customer anecdotes builds deep community trust!`;
        } else if (query.includes('trend') || query.includes('summer') || query.includes('style') || query.includes('hair trend')) {
            reply = `💇‍♀️ **Top Salon Styling Trends of the Season**:\n\n- **Butterfly Cuts & Wispy Layers**: Light, airy cuts with massive volume remain the most popular request among clients.\n- **Warm Caramel Balayage**: Soft, sun-kissed blending that requires minimal root touch-ups is highly favored for summer.\n- **Glass Hair Blowouts**: Hyper-glossy, ultra-straight, sleek styling locks are highly requested for weekend parties.\n- **Scalp Facial Treatments**: Adding detoxifying scalp scrubs + steam oil massages to treatment cards drives up average invoice size by 25%!`;
        }

        // 5. Default Warm Conversation & Fallback Rules for Maya Prompts
        else {
            if (query.includes('walk-in') || query.includes('who is available') || query.includes('fully booked')) {
                const currentTimeStr = new Intl.DateTimeFormat('en-US', { timeStyle: 'short' }).format(new Date());
                const staff = localDb.staff || [];
                const availableStaff = staff.filter(s => s.status === 'Active' || s.status === 'Available' || s.status === 'Checked-In');
                
                if (availableStaff.length > 0) {
                    const names = availableStaff.map(s => s.name).join(', ');
                    reply = `It is currently ${currentTimeStr}. We have ${availableStaff.length} stylists available right now: **${names}**. I can book a walk-in immediately. Shall I open the New Appointment form for you?`;
                    command = "switchView_bookings";
                } else {
                    reply = `It is currently ${currentTimeStr}. All staff appear to be fully booked or unavailable right now. Please check the schedule for the next open slot.`;
                    command = "switchView_calendar";
                }
            } else {
                reply = `Hello! I am **Maya** 🤖, your executive digital assistant.\n\nI am fully integrated with your live salon databases, staff rosters, and inventory levels!\n\n**Here are a few things I can assist you with**:\n- 📊 *Sales/Revenue check* (try: "Summarize today's revenue")\n- 👥 *Staff Availability* (try: "Who is fully booked today?")\n- 📦 *Stock levels* (try: "Any low stock right now?")\n- 📝 *WhatsApp templates* (try: "Write a Diwali festival promo message")\n- ⚙️ *Navigation* (try: "Switch to marketing tab")`;
            }
        }
        }
    } catch (err) {
        console.error('[AI CHAT ERROR]', err);
        reply = "I encountered an error querying the salon databases. Please verify your files and try again!";
    }

    res.json({ reply, command, data });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

