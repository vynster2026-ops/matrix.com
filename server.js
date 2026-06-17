require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const fs = require('fs');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, {
    cors: { origin: "*" }
});

io.on('connection', (socket) => {
    console.log('a user connected to socket.io');
    socket.on('disconnect', () => {
        console.log('user disconnected');
    });
});
app.use(cors()); // Permissive CORS for local development
app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

// Setup Nodemailer Transporter
const transporter = nodemailer.createTransport(
    process.env.SMTP_HOST
        ? {
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT) || 587,
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        }
        : {
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        }
);

// Helper to send emails
const sendOtpEmail = async (to, otp, type = '2fa') => {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.log(`[EMAIL SYSTEM] Bypassed sending email to ${to} (credentials not set in .env)`);
        return false;
    }

    const is2FA = type === '2fa';
    const subject = is2FA ? 'Medika - Secure 2FA Access Key' : 'Medika - Password Recovery Code';
    const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <div style="text-align: center; margin-bottom: 20px;">
                <h2 style="color: #00d2ff; margin: 0; font-family: 'Orbitron', sans-serif;">MedikaARTS SECURITY</h2>
            </div>
            <p>Hello,</p>
            <p>You requested access to your Medika portal. Use the following verification code to complete the verification sequence:</p>
            <div style="text-align: center; margin: 30px 0; background: #f7fafc; padding: 15px; border-radius: 6px; border: 1px solid #e2e8f0;">
                <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #00d2ff; font-family: monospace;">${otp}</span>
            </div>
            <p style="font-size: 12px; color: #718096; text-align: center;">This code is valid for 5 minutes. If you did not make this request, please secure your account immediately.</p>
        </div>
    `;

    try {
        await transporter.sendMail({
            from: `"Medika Security" <${process.env.EMAIL_USER}>`,
            to,
            subject,
            html: htmlContent
        });
        console.log(`[EMAIL SYSTEM] Verification email successfully sent to ${to}`);
        return true;
    } catch (error) {
        console.error(`[EMAIL SYSTEM ERROR] Failed to send email to ${to}:`, error);
        return false;
    }
};

const sendWelcomeEmail = async (to, name, password, branchId) => {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.log(`[EMAIL SYSTEM] Bypassed sending welcome email to ${to} (credentials not set in .env)`);
        return false;
    }

    const subject = 'Medika - Access License Granted';
    const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <div style="text-align: center; margin-bottom: 20px;">
                <h2 style="color: #1A6B8A; margin: 0; font-family: 'Orbitron', sans-serif;">MedikaARTS SYSTEM</h2>
            </div>
            <p>Dear ${name},</p>
            <p>We are pleased to inform you that your administrative access license for Medika Salon Management has been granted.</p>
            <p>Below are your login credentials to access the portal:</p>
            <div style="background: #f7fafc; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; margin: 20px 0;">
                <p style="margin: 5px 0;"><strong>Branch Identifier (Email):</strong> ${to}</p>
                <p style="margin: 5px 0;"><strong>Access Key (Password):</strong> ${password}</p>
                <p style="margin: 5px 0;"><strong>Assigned Node/Branch ID:</strong> ${branchId || 'Global Master'}</p>
            </div>
            <p>Please log in at your local portal URL (e.g., http://localhost:5000/login.html).</p>
            <p style="font-size: 12px; color: #718096; text-align: center; margin-top: 30px;">This is an automated security transmission. If you did not expect this license, please contact your Super Admin.</p>
        </div>
    `;

    try {
        await transporter.sendMail({
            from: `"Medika Administration" <${process.env.EMAIL_USER}>`,
            to,
            subject,
            html: htmlContent
        });
        console.log(`[EMAIL SYSTEM] Welcome email successfully sent to ${to}`);
        return true;
    } catch (error) {
        console.error(`[EMAIL SYSTEM ERROR] Failed to send welcome email to ${to}:`, error);
        return false;
    }
};

app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
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
        } catch (e) { console.error('[ERROR] DB removal failed:', e); }
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
        } catch (e) { }
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

    if (isConnected) {
        try {
            await Booking.updateOne({ $or: [{ id: id }, { _id: id }] }, updatedData);
            console.log(`[SUCCESS] Booking ${id} updated in MongoDB`);
        } catch (e) { console.error('[ERROR] MongoDB update failed:', e); }
    }

    const idx = localDb.bookings.findIndex(b => b.id === id || b._id === id);
    if (idx !== -1) {
        localDb.bookings[idx] = { ...localDb.bookings[idx], ...updatedData };
        saveLocal();
        console.log(`[SUCCESS] Booking ${id} updated in localDb.json`);
        return res.json({ success: true });
    }

    res.status(404).json({ error: 'Booking not found' });
});

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/medika';
const DB_FILE = 'db.json';

let localDb = {
    clients: [],
    staff: [],
    services: [],
    inventory: [],
    bookings: [],
    events: [],
    branches: [],
    expenses: [],
    chains: []
};
if (fs.existsSync(DB_FILE)) {
    try {
        localDb = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        if (!localDb.branches || localDb.branches.length === 0) {
            localDb.branches = [{ id: 'b1', name: 'Main Branch', location: 'Default Location', phone: '9876543210' }];
        }
        if (localDb.branches) {
            localDb.branches.forEach(b => {
                if (!b.verificationStatus) {
                    b.verificationStatus = 'Approved';
                    b.status = b.status || 'Active';
                }
            });
        }
        if (!localDb.expenses) {
            localDb.expenses = [];
        }
        if (!localDb.chains) {
            localDb.chains = [];
        }
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
// mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 2000 })
//   .then(() => { console.log('Connected to MongoDB'); isConnected = true; })
//   .catch(err => { console.error('MongoDB connection failed. Falling back to local storage.'); isConnected = false; });
console.log('Running in LOCAL STORAGE mode (MongoDB bypassed)');
isConnected = false;

const clientSchema = new mongoose.Schema({ id: String, name: String, phone: String, email: String, location: String, pts: Number, ltv: String, av: String, branchId: String }, { bufferCommands: false });
const staffSchema = new mongoose.Schema({ id: String, name: String, gender: String, spec: String, rating: String, av: String, services: [String], status: String, branchId: String }, { bufferCommands: false });
const serviceSchema = new mongoose.Schema({ id: String, name: String, cat: String, duration: Number, price: Number, prices: [Number], icon: String, gender: String, branchId: String }, { bufferCommands: false });
const inventorySchema = new mongoose.Schema({ id: String, name: String, cat: String, stock: Number, min: Number, unit: String, cost: Number, branchId: String }, { bufferCommands: false });
const bookingSchema = new mongoose.Schema({ id: String, clientId: String, clientName: String, services: [String], staffId: String, date: String, time: String, total: Number, status: String, notes: String, source: String, location: String, deposit: Boolean, timestamp: String, branchId: String }, { bufferCommands: false });
const eventSchema = new mongoose.Schema({ id: String, title: String, type: String, time: String, description: String, date: String, branchId: String }, { bufferCommands: false });
const expenseSchema = new mongoose.Schema({ id: String, title: String, amount: Number, category: String, date: String, notes: String, branchId: String }, { bufferCommands: false });

const branchSchema = new mongoose.Schema({
    id: String,
    name: String,
    location: String,
    phone: String,
    chainId: String,
    email: String,
    password: String,
    status: { type: String, default: 'Active' },
    verificationStatus: { type: String, default: 'Pending' },
    aadhaarNumber: String,
    aadhaarDoc: String,
    panNumber: String,
    panDoc: String,
    addressProofType: String,
    addressProofDoc: String,
    verificationNotes: String,
    verifiedAt: Date,
    verifiedBy: String
}, { bufferCommands: false });
const adminSchema = new mongoose.Schema({
    email: String,
    password: String,
    name: String,
    role: String,
    branchId: String,
    chainId: String,
    status: { type: String, default: 'Active' }, // 'Active', 'Inactive', 'Expired'
    expiry: Date
}, { bufferCommands: false });
const chainSchema = new mongoose.Schema({
    id: String,
    name: String,
    ownerName: String,
    ownerEmail: String,
    ownerPhone: String,
    status: { type: String, default: 'Active' }
}, { bufferCommands: false });

const Client = mongoose.model('Client', clientSchema);
const Staff = mongoose.model('Staff', staffSchema);
const Service = mongoose.model('Service', serviceSchema);
const Inventory = mongoose.model('Inventory', inventorySchema);
const Booking = mongoose.model('Booking', bookingSchema);
const Event = mongoose.model('Event', eventSchema);
const Branch = mongoose.model('Branch', branchSchema);
const Admin = mongoose.model('Admin', adminSchema);
const Expense = mongoose.model('Expense', expenseSchema);
const Chain = mongoose.model('Chain', chainSchema);

const leaveRequestSchema = new mongoose.Schema({
    staffId: String,
    staffName: String,
    fromDate: Date,
    toDate: Date,
    reason: String,
    status: { type: String, default: 'Pending' }
}, { bufferCommands: false });
const LeaveRequest = mongoose.model('LeaveRequest', leaveRequestSchema);

const notificationSchema = new mongoose.Schema({
    staffId: String,
    message: String,
    read: { type: Boolean, default: false },
    timestamp: { type: Date, default: Date.now }
}, { bufferCommands: false });
const Notification = mongoose.model('Notification', notificationSchema);

// Native JWT implementation
const JWT_SECRET = 'medika-secret-key-12345';
function generateToken(payload) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
    return `${header}.${body}.${signature}`;
}

function verifyToken(token) {
    try {
        if (!token) return null;
        if (token.startsWith('Bearer ')) token = token.substring(7);
        const [header, body, signature] = token.split('.');
        const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
        if (signature !== expectedSig) return null;
        return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    } catch (e) {
        return null;
    }
}

function getUserTier(admin) {
    if (!admin) return 2;
    if (admin.role === 'super') {
        return admin.tier || 1;
    }
    if (admin.role === 'owner' || admin.role === 'branch') {
        return 1;
    }
    if (admin.role === 'manager' || admin.role === 'finance') {
        return 2;
    }
    if (admin.role === 'reception') {
        return 3;
    }
    return admin.tier || 2;
}

// Server-side Tier-based Auth Middleware
const authMiddleware = (requiredTier = null) => {
    return (req, res, next) => {
        let token = req.headers['authorization'] || req.query.token;
        if (!token) {
            return res.status(401).json({ error: 'Access denied: Authentication token required.' });
        }

        const decoded = verifyToken(token);
        if (!decoded) {
            return res.status(401).json({ error: 'Access denied: Invalid or expired token.' });
        }

        req.user = decoded; // Attach user claims to request

        // If a required tier is specified, check it
        if (requiredTier !== null) {
            if (decoded.role !== 'super') {
                return res.status(403).json({ error: 'Access denied: Super Admin role required.' });
            }
            if (decoded.tier > requiredTier) {
                return res.status(403).json({ error: `Access denied: Requires Tier ${requiredTier} or higher (current: Tier ${decoded.tier}).` });
            }
        }
        next();
    };
};

// In-Memory Temporary OTP Store
const otpStore = {};

// Auth Middleware (Enhanced with 2FA & Password Recovery Support)
app.post('/api/auth/login', async (req, res) => {
    const { email, password, use2FA } = req.body;

    if (!localDb.admins) {
        localDb.admins = [{
            email: 'admin@medika.com',
            password: 'admin',
            name: 'Founder (Tier 1)',
            role: 'super',
            tier: 1,
            status: 'Active'
        }];
        saveLocal();
    }

    let admin = null;
    if (isConnected) {
        try { admin = await Admin.findOne({ email, password }).lean(); } catch (e) { }
    } else {
        admin = localDb.admins.find(a => a.email === email && a.password === password);
    }

    if (!admin) {
        let branch = null;
        if (isConnected) {
            try { branch = await Branch.findOne({ email, password }).lean(); } catch (e) { }
        } else {
            branch = (localDb.branches || []).find(b => b.email === email && b.password === password);
        }
        if (branch) {
            if (branch.verificationStatus === 'Pending') {
                return res.status(403).json({
                    error: 'Your salon onboarding is pending verification by our validation team. Please wait for document approval (Aadhaar, PAN, Address Proof).'
                });
            } else if (branch.verificationStatus === 'Rejected') {
                return res.status(403).json({
                    error: `Your salon onboarding has been rejected. Reason: ${branch.verificationNotes || 'Document verification failed.'}`
                });
            } else if (branch.status === 'Suspended') {
                return res.status(403).json({
                    error: 'Branch License Expired or Suspended. Please contact the Super Admin.'
                });
            }
            admin = {
                email: branch.email,
                password: branch.password,
                name: `${branch.name} Manager`,
                role: 'manager',
                tier: 2,
                status: 'Active',
                branchId: branch.id
            };
        }
    }
    if (admin) {
        // Check if admin is active
        if (admin.role !== 'super' && admin.status !== 'Active') {
            return res.status(403).json({
                error: 'License Expired or Inactive. Please contact the Super Admin for activation.'
            });
        }

        // Tier 1 Owners/Founders MUST use 2FA
        const userTier = getUserTier(admin);
        const needs2FA = (userTier === 1) || (use2FA === true);

        if (needs2FA) {
            // Generate a 6-digit 2FA code
            const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
            otpStore[email] = {
                code: otpCode,
                type: '2fa',
                expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes validity
            };

            // Log beautifully to console for local sandbox development
            console.log('\n\x1b[36m%s\x1b[0m', '┌────────────────────────────────────────────────────────┐');
            console.log('\x1b[36m%s\x1b[0m', `│  [2FA GATEWAY] DUAL-FACTOR AUTH INITIATED FOR:          │`);
            console.log('\x1b[36m%s\x1b[0m', `│  EMAIL: ${email.padEnd(46)} │`);
            console.log('\x1b[36m%s\x1b[0m', `│  OTP CODE: ${otpCode.padEnd(43)} │`);
            console.log('\x1b[36m%s\x1b[0m', '└────────────────────────────────────────────────────────┘\n');

            // Send real-time OTP to client email
            await sendOtpEmail(email, otpCode, '2fa');

            return res.json({
                success: true,
                require2FA: true,
                email: email,
                simulatedOtp: otpCode
            });
        }

        // Traditional Direct Login (Bypass/Standard)
        const token = generateToken({
            email: admin.email,
            name: admin.name,
            role: admin.role,
            tier: userTier,
            branchId: admin.branchId || null
        });

        return res.json({
            success: true,
            token: token,
            user: {
                name: admin.name,
                role: admin.role,
                tier: userTier,
                status: admin.status,
                branchId: admin.branchId || null
            }
        });
    }

    res.status(401).json({ error: 'Invalid credentials' });
});

// 2FA Verification Endpoint
app.post('/api/auth/verify-2fa', async (req, res) => {
    const { email, code } = req.body;

    const record = otpStore[email];
    if (!record || record.type !== '2fa' || record.code !== code || record.expiresAt < Date.now()) {
        return res.status(400).json({ error: 'Invalid or expired verification code' });
    }

    // Success! Clear the OTP
    delete otpStore[email];

    // Get Admin Details
    let admin = null;
    if (isConnected) {
        try { admin = await Admin.findOne({ email }).lean(); } catch (e) { }
    } else {
        admin = localDb.admins.find(a => a.email === email);
    }

    if (!admin) {
        let branch = null;
        if (isConnected) {
            try { branch = await Branch.findOne({ email }).lean(); } catch (e) { }
        } else {
            branch = (localDb.branches || []).find(b => b.email === email);
        }
        if (branch) {
            admin = {
                email: branch.email,
                name: `${branch.name} Manager`,
                role: 'manager',
                tier: 2,
                status: branch.status === 'Suspended' ? 'Inactive' : 'Active',
                branchId: branch.id
            };
        }
    }

    if (!admin) {
        return res.status(404).json({ error: 'Admin record not found' });
    }

    console.log(`[2FA SUCCESS] User ${email} authenticated at ${new Date().toISOString()}`);

    const userTier = getUserTier(admin);
    const token = generateToken({
        email: admin.email,
        name: admin.name,
        role: admin.role,
        tier: userTier,
        branchId: admin.branchId || null
    });

    return res.json({
        success: true,
        token: token,
        user: {
            name: admin.name,
            role: admin.role,
            tier: userTier,
            status: admin.status,
            branchId: admin.branchId || null
        }
    });
});

// Password Recovery Initiation Endpoint
app.post('/api/auth/forgot-password', async (req, res) => {
    const { email } = req.body;

    if (!localDb.admins) {
        localDb.admins = [{
            email: 'admin@medika.com',
            password: 'admin',
            name: 'Super Admin',
            role: 'super',
            status: 'Active'
        }];
        saveLocal();
    }

    let admin = null;
    if (isConnected) {
        try { admin = await Admin.findOne({ email }).lean(); } catch (e) { }
    } else {
        admin = localDb.admins.find(a => a.email === email);
    }

    if (!admin) {
        let branch = null;
        if (isConnected) {
            try { branch = await Branch.findOne({ email }).lean(); } catch (e) { }
        } else {
            branch = (localDb.branches || []).find(b => b.email === email);
        }
        if (branch) {
            admin = {
                email: branch.email,
                name: `${branch.name} Manager`
            };
        }
    }

    if (!admin) {
        return res.status(444).json({ error: 'No account registered with this email address.' });
    }

    // Generate a 6-digit recovery code
    const recoveryCode = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore[email] = {
        code: recoveryCode,
        type: 'recovery',
        expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes validity
    };

    // Log beautifully to console for local sandbox development
    console.log('\n\x1b[35m%s\x1b[0m', '┌────────────────────────────────────────────────────────┐');
    console.log('\x1b[35m%s\x1b[0m', `│  [RECOVERY GATEWAY] PASSWORD RESET REQUESTED FOR:      │`);
    console.log('\x1b[35m%s\x1b[0m', `│  EMAIL: ${email.padEnd(46)} │`);
    console.log('\x1b[35m%s\x1b[0m', `│  OTP CODE: ${recoveryCode.padEnd(43)} │`);
    console.log('\x1b[35m%s\x1b[0m', '└────────────────────────────────────────────────────────┘\n');

    // Send real-time recovery OTP to client email
    await sendOtpEmail(email, recoveryCode, 'recovery');

    return res.json({
        success: true,
        email: email,
        simulatedOtp: recoveryCode
    });
});

// Password Recovery OTP Verification
app.post('/api/auth/verify-recovery', (req, res) => {
    const { email, code } = req.body;

    const record = otpStore[email];
    if (!record || record.type !== 'recovery' || record.code !== code || record.expiresAt < Date.now()) {
        return res.status(400).json({ error: 'Invalid or expired recovery code' });
    }

    // Generate secure temporary recovery token
    const resetToken = 'reset-token-' + crypto.randomBytes(16).toString('hex');
    otpStore[email].resetToken = resetToken;
    otpStore[email].expiresAt = Date.now() + 5 * 60 * 1000; // extend by 5 minutes for new password entry

    console.log(`[RECOVERY VERIFIED] Password recovery verified for ${email}`);

    return res.json({
        success: true,
        resetToken: resetToken
    });
});

// Password Reset Executing Endpoint
app.post('/api/auth/reset-password', async (req, res) => {
    const { email, resetToken, newPassword } = req.body;

    const record = otpStore[email];
    if (!record || record.type !== 'recovery' || record.resetToken !== resetToken || record.expiresAt < Date.now()) {
        return res.status(400).json({ error: 'Recovery session expired. Please start over.' });
    }

    let updated = false;

    // Find and update Admin
    const idx = localDb.admins ? localDb.admins.findIndex(a => a.email === email) : -1;
    if (idx !== -1) {
        localDb.admins[idx].password = newPassword;
        saveLocal();

        // Sync with MongoDB if MongoDB is active
        if (isConnected) {
            try {
                await Admin.updateOne({ email }, { password: newPassword });
                console.log(`[SYNC SUCCESS] Password updated in MongoDB for admin ${email}`);
            } catch (e) {
                console.error('[SYNC ERROR] MongoDB admin password sync failed:', e);
            }
        }
        updated = true;
    } else {
        // Find and update Branch Manager
        const branchIdx = localDb.branches ? localDb.branches.findIndex(b => b.email === email) : -1;
        if (branchIdx !== -1) {
            localDb.branches[branchIdx].password = newPassword;
            saveLocal();

            if (isConnected) {
                try {
                    await Branch.updateOne({ email }, { password: newPassword });
                    console.log(`[SYNC SUCCESS] Password updated in MongoDB for branch ${email}`);
                } catch (e) {
                    console.error('[SYNC ERROR] MongoDB branch password sync failed:', e);
                }
            }
            updated = true;
        }
    }

    if (updated) {
        // Success! Clear the OTP record from cache
        delete otpStore[email];

        console.log(`[RECOVERY SUCCESS] Password successfully reset for user ${email}`);
        return res.json({ success: true, message: 'Password updated successfully' });
    }

    res.status(404).json({ error: 'Account record not found' });
});

// Helpers to mask PII
const maskPhone = (p) => {
    if (!p) return '';
    const str = String(p).trim();
    if (str.length <= 4) return '****';
    return '*'.repeat(str.length - 4) + str.slice(-4);
};
const maskEmail = (e) => {
    if (!e) return '';
    const str = String(e).trim();
    const parts = str.split('@');
    if (parts.length !== 2) return '****';
    const name = parts[0];
    const domain = parts[1];
    if (name.length <= 2) return '*@' + domain;
    return name[0] + '*'.repeat(name.length - 2) + name[name.length - 1] + '@' + domain;
};

// Admin Management (For Super Admin)
app.get('/api/admins', authMiddleware(2), (req, res) => {
    res.json(localDb.admins || []);
});

app.post('/api/admins', authMiddleware(1), async (req, res) => {
    const newAdmin = req.body;
    if (!localDb.admins) localDb.admins = [];

    if (localDb.admins.find(a => a.email === newAdmin.email)) {
        return res.status(400).json({ error: 'Admin already exists' });
    }

    localDb.admins.push(newAdmin);
    saveLocal();

    // Send credentials to licensee's email
    await sendWelcomeEmail(newAdmin.email, newAdmin.name, newAdmin.password, newAdmin.branchId);

    res.json({ success: true });
});

app.put('/api/admins/status', authMiddleware(1), (req, res) => {
    const { email, status } = req.body;
    if (!localDb.admins) return res.status(404).json({ error: 'No admins found' });

    const idx = localDb.admins.findIndex(a => a.email === email);
    if (idx !== -1) {
        localDb.admins[idx].status = status;
        saveLocal();
        return res.json({ success: true });
    }
    res.status(404).json({ error: 'Admin not found' });
});

// Clients
app.get('/api/clients', async (req, res) => {
    const { branchId } = req.query;
    let isTier1 = false;
    const token = req.headers['authorization'] || req.query.token;
    if (token) {
        const decoded = verifyToken(token);
        if (decoded && (decoded.tier === 1 || decoded.role === 'super')) {
            isTier1 = true;
        }
    }

    let clients = [];
    if (isConnected) {
        try {
            const filter = branchId ? { branchId } : {};
            clients = await Client.find(filter).lean();
        } catch (e) { }
    } else {
        clients = JSON.parse(JSON.stringify(localDb.clients || []));
        if (branchId) clients = clients.filter(c => c.branchId === branchId || !c.branchId);
    }

    // Apply PII Masking if not Tier 1
    if (!isTier1) {
        clients = clients.map(c => ({
            ...c,
            phone: maskPhone(c.phone),
            email: maskEmail(c.email)
        }));
    }

    res.json(clients);
});
app.post('/api/clients', async (req, res) => {
    const data = req.body;
    if (isConnected) { try { return res.json(await new Client(data).save()); } catch (e) { } }
    localDb.clients.push(data); saveLocal(); res.json(data);
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
        } catch (e) { }
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
    const { branchId } = req.query;
    if (isConnected) { try { return res.json(await Staff.find(branchId ? { branchId } : {})); } catch (e) { } }
    let data = localDb.staff;
    if (branchId) data = data.filter(s => s.branchId === branchId || !s.branchId);
    res.json(data);
});
app.post('/api/staff', async (req, res) => {
    if (isConnected) { try { return res.json(await new Staff(req.body).save()); } catch (e) { } }
    localDb.staff.push(req.body); saveLocal(); res.json(req.body);
});

// Services
app.get('/api/services', async (req, res) => {
    const { branchId } = req.query;
    if (isConnected) { try { return res.json(await Service.find(branchId ? { branchId } : {})); } catch (e) { } }
    let data = localDb.services;
    if (branchId) data = data.filter(s => s.branchId === branchId || !s.branchId);
    res.json(data);
});

app.post('/api/services', async (req, res) => {
    console.log('Received POST request for new service:', req.body);
    if (isConnected) { try { return res.json(await new Service(req.body).save()); } catch (e) { } }
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
        } catch (e) { }
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
        } catch (e) { }
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
    const { branchId } = req.query;
    if (isConnected) { try { return res.json(await Inventory.find(branchId ? { branchId } : {})); } catch (e) { } }
    let data = localDb.inventory;
    if (branchId) data = data.filter(i => i.branchId === branchId || !i.branchId);
    res.json(data);
});
app.post('/api/inventory', async (req, res) => {
    if (isConnected) { try { return res.json(await new Inventory(req.body).save()); } catch (e) { } }
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
        } catch (e) { }
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
        } catch (e) { }
    }
    const idx = localDb.inventory.findIndex(i => i.id === req.params.id || i.name === req.params.id);
    if (idx !== -1) {
        localDb.inventory.splice(idx, 1);
        saveLocal();
        return res.json({ success: true });
    }
    res.status(404).json({ error: 'Item not found' });
});

// Expenses
app.get('/api/expenses', async (req, res) => {
    const { branchId } = req.query;
    if (isConnected) { try { return res.json(await Expense.find(branchId ? { branchId } : {})); } catch (e) { } }
    let data = localDb.expenses || [];
    if (branchId) data = data.filter(e => e.branchId === branchId || !e.branchId);
    res.json(data);
});
app.post('/api/expenses', async (req, res) => {
    if (isConnected) { try { return res.json(await new Expense(req.body).save()); } catch (e) { } }
    if (!localDb.expenses) localDb.expenses = [];
    localDb.expenses.push(req.body); saveLocal(); res.json(req.body);
});
app.put('/api/expenses/:id', async (req, res) => {
    if (isConnected) {
        try {
            const updated = await Expense.findOneAndUpdate(
                { id: req.params.id },
                req.body,
                { new: true }
            );
            if (updated) return res.json(updated);
        } catch (e) { }
    }
    if (!localDb.expenses) localDb.expenses = [];
    const idx = localDb.expenses.findIndex(e => e.id === req.params.id);
    if (idx !== -1) {
        localDb.expenses[idx] = { ...localDb.expenses[idx], ...req.body };
        saveLocal();
        return res.json(localDb.expenses[idx]);
    }
    res.status(404).json({ error: 'Not found' });
});
app.delete('/api/expenses/:id', async (req, res) => {
    if (isConnected) {
        try {
            await Expense.deleteOne({ id: req.params.id });
            return res.json({ success: true });
        } catch (e) { }
    }
    if (!localDb.expenses) localDb.expenses = [];
    const idx = localDb.expenses.findIndex(e => e.id === req.params.id);
    if (idx !== -1) {
        localDb.expenses.splice(idx, 1);
        saveLocal();
        return res.json({ success: true });
    }
    res.status(404).json({ error: 'Item not found' });
});

// Bookings
app.get('/api/bookings', async (req, res) => {
    const { branchId } = req.query;
    if (isConnected) { try { return res.json(await Booking.find(branchId ? { branchId } : {})); } catch (e) { } }
    let data = localDb.bookings;
    if (branchId) data = data.filter(b => b.branchId === branchId || !b.branchId);
    res.json(data);
});
app.post('/api/bookings', async (req, res) => {
    let result = req.body;
    let saved = false;
    
    if (isConnected) {
        try { 
            result = await new Booking(req.body).save(); 
            saved = true;
            
            // Create notification and emit socket event for the assigned staff
            if (result.staffId) {
                const message = `New appointment assigned for ${result.clientName || 'a client'}`;
                await Notification.create({ staffId: result.staffId, message: message });
                io.emit("newAppointment", result);
                io.emit("newNotification", { staffId: result.staffId, message: message });
            }
            if (result.additionalStaff && Array.isArray(result.additionalStaff)) {
                for (const asId of result.additionalStaff) {
                    const msg = `You have been added to an appointment for ${result.clientName || 'a client'}`;
                    await Notification.create({ staffId: asId, message: msg });
                    io.emit("newNotification", { staffId: asId, message: msg });
                }
            }
        } catch(e) {
            console.error("MongoDB save failed for new booking:", e.message);
        } 
    }
    
    if (!saved) {
        // Fallback or duplicate to local JSON db
        localDb.bookings.push(result);
        saveLocal();
        
        // Also emit socket events for local setup
        if (result.staffId) {
            io.emit("newAppointment", result);
            io.emit("newNotification", { staffId: result.staffId, message: `New appointment assigned for ${result.clientName || 'a client'}` });
        }
    }
    
    res.json(result);
});
app.put('/api/bookings/:id', async (req, res) => {
    if (isConnected) { try { return res.json(await Booking.findOneAndUpdate({ id: req.params.id }, req.body, { new: true })); } catch (e) { } }
    const idx = localDb.bookings.findIndex(b => b.id === req.params.id);
    if (idx !== -1) { localDb.bookings[idx] = { ...localDb.bookings[idx], ...req.body }; saveLocal(); return res.json(localDb.bookings[idx]); }
    res.status(404).json({ error: 'Not found' });
});
app.delete('/api/bookings/:id', async (req, res) => {
    const id = req.params.id;
    if (isConnected) {
        try {
            const result = await Booking.deleteOne({ $or: [{ id: id }, { _id: id }] });
            if (result.deletedCount > 0) return res.json({ success: true });
        } catch (e) { }
    }
    const idx = localDb.bookings.findIndex(b => b.id === id || b._id === id);
    if (idx !== -1) {
        localDb.bookings.splice(idx, 1);
        saveLocal();
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
            if (result.deletedCount > 0) return res.json({ success: true });
        } catch (e) { }
    }
    const idx = localDb.bookings.findIndex(b => b.id === id || b._id === id);
    if (idx !== -1) {
        localDb.bookings.splice(idx, 1);
        saveLocal();
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
    const { branchId } = req.query;
    if (isConnected) { try { return res.json(await Event.find(branchId ? { branchId } : {})); } catch (e) { } }
    let data = localDb.events || [];
    if (branchId) data = data.filter(e => e.branchId === branchId || !e.branchId);
    res.json(data);
});
app.post('/api/events', async (req, res) => {
    if (isConnected) { try { return res.json(await new Event(req.body).save()); } catch (e) { } }
    if (!localDb.events) localDb.events = [];
    localDb.events.push(req.body); saveLocal(); res.json(req.body);
});
app.put('/api/events/:id', async (req, res) => {
    if (isConnected) { try { return res.json(await Event.findOneAndUpdate({ id: req.params.id }, req.body, { new: true })); } catch (e) { } }
    const idx = (localDb.events || []).findIndex(e => e.id === req.params.id);
    if (idx !== -1) { localDb.events[idx] = { ...localDb.events[idx], ...req.body }; saveLocal(); return res.json(localDb.events[idx]); }
    res.status(404).json({ error: 'Not found' });
});
// Enrich branch objects with calculated telemetry, subscription, and last activity metrics
const enrichBranches = (branchesList) => {
    const bookings = localDb.bookings || [];
    const chains = localDb.chains || [];
    const staff = localDb.staff || [];
    const services = localDb.services || [];
    return branchesList.map(b => {
        // Calculate last activity dynamically from bookings
        const branchBookings = bookings.filter(bk => bk.branchId === b.id);
        let lastActivity = 'No recent activity';
        if (branchBookings.length > 0) {
            const sorted = branchBookings.sort((x, y) => new Date(y.createdAt || y.date) - new Date(x.createdAt || x.date));
            const lastBooking = sorted[0];
            const bookingDate = new Date(lastBooking.createdAt || lastBooking.date);
            const diffMs = Date.now() - bookingDate;
            const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
            if (diffHrs < 1) {
                lastActivity = 'Active < 1 hr ago';
            } else if (diffHrs < 24) {
                lastActivity = `${diffHrs} hrs ago`;
            } else {
                lastActivity = `${Math.floor(diffHrs / 24)} days ago`;
            }
        }

        // Subscription details fallback/storage
        const subDetails = b.subscription || {
            plan: 'Premium Growth Plan',
            price: '₹4,999/mo',
            expiry: '2027-05-24',
            status: b.status || 'Active'
        };

        const chain = chains.find(c => c.id === b.chainId);
        const branchStaffCount = staff.filter(s => s.branchId === b.id).length;
        const branchServicesCount = services.filter(s => s.branchId === b.id).length;
        const grossRevenue = branchBookings.reduce((sum, bk) => sum + (bk.total || 0), 0);

        // Generate brand signature and telemetry placeholders
        const brandCode = 'MD-' + crypto.createHash('md5').update(b.id || 'b1').digest('hex').substring(0, 8).toUpperCase();
        const sinVal = Math.sin(b.name ? b.name.charCodeAt(0) : 1);
        const pingLatency = Math.floor((sinVal * 5) + 12) + 'ms';

        let gpsCoords = '17.3850° N, 78.4867° E'; // Hyderabad default
        if (b.location && b.location.toLowerCase().includes('dilshuknagar')) {
            gpsCoords = '17.3685° N, 78.5316° E';
        } else if (b.location && b.location.toLowerCase().includes('bengalore')) {
            gpsCoords = '12.9716° N, 77.5946° E';
        }

        const dbSyncTime = new Date(Date.now() - Math.floor(Math.abs(sinVal) * 8 * 60 * 1000)).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

        return {
            ...b,
            status: b.status || 'Active',
            lastActivity,
            subscription: subDetails,
            chainId: b.chainId || null,
            chainName: chain ? chain.name : 'Independent',
            staffCount: branchStaffCount,
            servicesCount: branchServicesCount,
            bookingCount: branchBookings.length,
            grossRevenue,
            brandCode,
            pingLatency,
            gpsCoords,
            dbSyncTime
        };
    });
};

// Branches
app.get('/api/branches', async (req, res) => {
    let branches = [];
    if (isConnected) { try { branches = await Branch.find().lean(); } catch (e) { } }
    else { branches = JSON.parse(JSON.stringify(localDb.branches || [])); }
    res.json(enrichBranches(branches));
});

app.get('/api/salons/search', async (req, res) => {
    const { query } = req.query;
    let branches = [];
    if (isConnected) { try { branches = await Branch.find().lean(); } catch (e) { } }
    else { branches = JSON.parse(JSON.stringify(localDb.branches || [])); }

    let enriched = enrichBranches(branches);

    if (query) {
        const q = String(query).toLowerCase().trim();
        enriched = enriched.filter(b => {
            return (
                (b.id && b.id.toLowerCase().includes(q)) ||
                (b.name && b.name.toLowerCase().includes(q)) ||
                (b.location && b.location.toLowerCase().includes(q)) ||
                (b.phone && b.phone.toLowerCase().includes(q)) ||
                (b.brandCode && b.brandCode.toLowerCase().includes(q)) ||
                (b.chainName && b.chainName.toLowerCase().includes(q))
            );
        });
    }
    res.json(enriched);
});

app.post('/api/branches', async (req, res) => {
    const data = req.body;
    data.verificationStatus = data.verificationStatus || 'Pending';
    data.status = data.verificationStatus === 'Approved' ? 'Active' : 'Suspended';
    if (isConnected) { try { return res.json(await new Branch(data).save()); } catch (e) { } }
    localDb.branches.push(data); saveLocal(); res.json(data);
});

app.put('/api/branches/:id', async (req, res) => {
    if (isConnected) { try { return res.json(await Branch.findOneAndUpdate({ id: req.params.id }, req.body, { new: true })); } catch (e) { } }
    const idx = localDb.branches.findIndex(b => b.id === req.params.id);
    if (idx !== -1) { localDb.branches[idx] = { ...localDb.branches[idx], ...req.body }; saveLocal(); return res.json(localDb.branches[idx]); }
    res.status(404).json({ error: 'Not found' });
});

app.put('/api/branches/:id/status', authMiddleware(1), async (req, res) => {
    const { id } = req.params;
    const { status } = req.body; // 'Active', 'Suspended'

    if (isConnected) {
        try {
            await Branch.updateOne({ id }, { status });
        } catch (e) { }
    }

    const idx = localDb.branches.findIndex(b => b.id === id);
    if (idx !== -1) {
        localDb.branches[idx].status = status;
        saveLocal();
        return res.json({ success: true, branch: localDb.branches[idx] });
    }
    res.status(404).json({ error: 'Branch not found' });
});

app.put('/api/branches/:id/verify', authMiddleware(1), async (req, res) => {
    const { id } = req.params;
    const { verificationStatus, verificationNotes } = req.body;
    const status = verificationStatus === 'Approved' ? 'Active' : 'Suspended';

    const updateData = {
        verificationStatus,
        verificationNotes: verificationNotes || '',
        verifiedAt: new Date(),
        verifiedBy: req.user.email,
        status
    };

    if (isConnected) {
        try {
            await Branch.updateOne({ id }, updateData);
        } catch (e) { }
    }

    const idx = localDb.branches.findIndex(b => b.id === id);
    if (idx !== -1) {
        localDb.branches[idx] = { ...localDb.branches[idx], ...updateData };
        saveLocal();

        // Notify owner if approved
        if (verificationStatus === 'Approved') {
            sendWelcomeEmail(
                localDb.branches[idx].email,
                localDb.branches[idx].name,
                localDb.branches[idx].password,
                localDb.branches[idx].id
            ).catch(console.error);
        }

        return res.json({ success: true, branch: localDb.branches[idx] });
    }
    res.status(404).json({ error: 'Branch not found' });
});

app.delete('/api/branches/:id', async (req, res) => {
    if (isConnected) { try { await Branch.deleteOne({ id: req.params.id }); return res.json({ success: true }); } catch (e) { } }
    const idx = localDb.branches.findIndex(b => b.id === req.params.id);
    if (idx !== -1) { localDb.branches.splice(idx, 1); saveLocal(); return res.json({ success: true }); }
    res.status(404).json({ error: 'Not found' });
});

// --- NEW: Chains & Multi-Salon API ---
app.get('/api/chains', async (req, res) => {
    let chains = [];
    if (isConnected) {
        try { chains = await Chain.find().lean(); } catch (e) { }
    } else {
        chains = JSON.parse(JSON.stringify(localDb.chains || []));
    }
    res.json(chains);
});

app.post('/api/chains', async (req, res) => {
    const data = req.body;
    data.status = data.status || 'Active';
    if (isConnected) {
        try { return res.json(await new Chain(data).save()); } catch (e) { }
    }
    if (!localDb.chains) localDb.chains = [];
    localDb.chains.push(data);
    saveLocal();

    // Also create a corresponding admin with role 'owner' if owner email is provided
    if (data.ownerEmail) {
        const password = data.ownerPassword || 'password123';
        if (!localDb.admins) localDb.admins = [];
        const existingAdmin = localDb.admins.find(a => a.email === data.ownerEmail);
        if (!existingAdmin) {
            const newAdmin = {
                email: data.ownerEmail,
                name: data.ownerName,
                password: password,
                role: 'owner',
                chainId: data.id,
                status: 'Active'
            };
            localDb.admins.push(newAdmin);
            saveLocal();
            // Send welcome email (non-blocking)
            sendWelcomeEmail(newAdmin.email, newAdmin.name, newAdmin.password, `Chain: ${data.name}`).catch(console.error);
        }
    }

    res.json(data);
});

app.put('/api/chains/:id', async (req, res) => {
    const { id } = req.params;
    const data = req.body;
    if (isConnected) {
        try { return res.json(await Chain.findOneAndUpdate({ id }, data, { new: true })); } catch (e) { }
    }
    if (!localDb.chains) localDb.chains = [];
    const idx = localDb.chains.findIndex(c => c.id === id);
    if (idx !== -1) {
        localDb.chains[idx] = { ...localDb.chains[idx], ...data };
        saveLocal();
        return res.json(localDb.chains[idx]);
    }
    res.status(404).json({ error: 'Chain not found' });
});

app.delete('/api/chains/:id', async (req, res) => {
    const { id } = req.params;
    if (isConnected) {
        try { await Chain.deleteOne({ id }); } catch (e) { }
    }
    if (!localDb.chains) localDb.chains = [];
    const idx = localDb.chains.findIndex(c => c.id === id);
    if (idx !== -1) {
        localDb.chains.splice(idx, 1);
        saveLocal();
    }

    // Unlink branches associated with this chain
    if (localDb.branches) {
        localDb.branches.forEach(b => {
            if (b.chainId === id) delete b.chainId;
        });
        saveLocal();
    }

    // Suspend associated admin owners
    if (localDb.admins) {
        localDb.admins.forEach(a => {
            if (a.chainId === id) a.status = 'Inactive';
        });
        saveLocal();
    }

    res.json({ success: true });
});

// Seed
app.post('/api/seed', async (req, res) => {
    const { clients, staff, services, inventory, events, expenses } = req.body;
    if (isConnected) {
        try {
            if (clients) { await Client.deleteMany({}); await Client.insertMany(clients); }
            if (staff) { await Staff.deleteMany({}); await Staff.insertMany(staff); }
            if (services) { await Service.deleteMany({}); await Service.insertMany(services); }
            if (inventory) { await Inventory.deleteMany({}); await Inventory.insertMany(inventory); }
            if (events) { await Event.deleteMany({}); await Event.insertMany(events); }
            if (expenses) { await Expense.deleteMany({}); await Expense.insertMany(expenses); }
        } catch (e) { console.error('Seed error:', e); }
    }
    if (clients) localDb.clients = clients;
    if (staff) localDb.staff = staff;
    if (services) localDb.services = services;
    if (inventory) localDb.inventory = inventory;
    if (events) localDb.events = events;
    if (expenses) localDb.expenses = expenses;
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

// --- Marketing Requests API ---
app.get('/api/marketing', async (req, res) => {
    let data = localDb.marketingRequests || [];
    res.json(data);
});

app.post('/api/marketing', async (req, res) => {
    const data = req.body;
    data.status = data.status || 'Pending';
    if (!localDb.marketingRequests) localDb.marketingRequests = [];
    localDb.marketingRequests.push(data);
    saveLocal();
    res.json(data);
});

app.put('/api/marketing/:id/approve', async (req, res) => {
    const { id } = req.params;
    if (!localDb.marketingRequests) localDb.marketingRequests = [];
    const idx = localDb.marketingRequests.findIndex(r => String(r.id) === String(id));
    if (idx !== -1) {
        localDb.marketingRequests[idx].status = 'Approved';
        saveLocal();
        return res.json(localDb.marketingRequests[idx]);
    }
    res.status(404).json({ error: 'Marketing request not found' });
});

app.put('/api/marketing/:id/deny', async (req, res) => {
    const { id } = req.params;
    if (!localDb.marketingRequests) localDb.marketingRequests = [];
    const idx = localDb.marketingRequests.findIndex(r => String(r.id) === String(id));
    if (idx !== -1) {
        localDb.marketingRequests[idx].status = 'Denied';
        saveLocal();
        return res.json(localDb.marketingRequests[idx]);
    }
    res.status(404).json({ error: 'Marketing request not found' });
});

// --- Generate Branch Credentials ---
app.post('/api/admin/generate-branch-credentials', async (req, res) => {
    const { branchName, accessKey, passcode } = req.body;
    if (!localDb.branches) localDb.branches = [];

    let branch = localDb.branches.find(b => b.name === branchName);
    if (!branch) {
        branch = {
            id: 'b' + Date.now(),
            name: branchName,
            status: 'Active',
            verificationStatus: 'Approved'
        };
        localDb.branches.push(branch);
    }
    branch.email = accessKey;
    branch.password = passcode;

    // Also save to mongo if connected
    if (isConnected) {
        try {
            await Branch.updateOne(
                { name: branchName },
                { $set: { email: accessKey, password: passcode, status: 'Active', verificationStatus: 'Approved' } },
                { upsert: true }
            );
        } catch (e) { console.error('Error saving branch creds to mongo:', e); }
    }

    saveLocal();
    res.json({ success: true, branch });
});

// --- HTML Module Merger (Logic from merge.js) ---
app.post('/api/admin/merge-modules', (req, res) => {
    try {
        const targetFile = 'Medika_complete_module.html';
        const sourceFile = 'complete_module.html';
        const outputFile = 'Medika_complete_module_merged.html';

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

// --- UNIFIED API ENDPOINTS ---

// Global Leave Requests API
app.post('/api/leave-request', async (req, res) => {
    const data = req.body;
    data._id = data._id || data.id || 'leave-' + Date.now();
    data.status = data.status || 'Pending';
    
    if (isConnected) {
        try {
            const leave = new LeaveRequest(data);
            await leave.save();
            return res.json({ success: true, leave });
        } catch(e) {
            console.error("MongoDB leave request save failed:", e.message);
        }
    }
    
    if (!localDb.leaveRequests) localDb.leaveRequests = [];
    localDb.leaveRequests.push(data);
    saveLocal();
    res.json({ success: true, leave: data });
});

app.get('/api/leave-requests', async (req, res) => {
    if (isConnected) {
        try {
            return res.json(await LeaveRequest.find());
        } catch(e) {}
    }
    res.json(localDb.leaveRequests || []);
});

app.put('/api/leave-request/:id', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    
    if (isConnected) {
        try {
            const updated = await LeaveRequest.findByIdAndUpdate(id, { status }, { new: true });
            if (updated) return res.json({ success: true, leave: updated });
        } catch(e) {}
    }
    
    if (!localDb.leaveRequests) localDb.leaveRequests = [];
    const idx = localDb.leaveRequests.findIndex(l => String(l._id || l.id) === String(id));
    if (idx !== -1) {
        localDb.leaveRequests[idx].status = status;
        saveLocal();
        return res.json({ success: true, leave: localDb.leaveRequests[idx] });
    }
    res.status(404).json({ error: 'Leave request not found' });
});

app.get('/api/my-leaves', async (req, res) => {
    const { staffId } = req.query;
    if (isConnected) {
        try {
            return res.json(await LeaveRequest.find({ staffId }));
        } catch(e) {}
    }
    const leaves = (localDb.leaveRequests || []).filter(l => String(l.staffId) === String(staffId));
    res.json(leaves);
});

// Appointments API (Filtered by staffId)
app.get('/api/my-appointments', async (req, res) => {
    const { staffId } = req.query;
    if (isConnected) {
        try {
            const bookings = await Booking.find({
                $or: [
                    { staffId: staffId },
                    { additionalStaff: staffId }
                ]
            });
            return res.json(bookings);
        } catch(e) {}
    }
    const bookings = (localDb.bookings || []).filter(b => 
        String(b.staffId) === String(staffId) || 
        (b.additionalStaff && b.additionalStaff.includes(staffId))
    );
    res.json(bookings);
});

// Notifications API
app.get('/api/notifications', async (req, res) => {
    const { staffId } = req.query;
    if (isConnected) {
        try {
            return res.json(await Notification.find({ staffId }).sort({ timestamp: -1 }));
        } catch(e) {}
    }
    const notifications = (localDb.notifications || [])
        .filter(n => String(n.staffId) === String(staffId))
        .sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.json(notifications);
});

app.put('/api/notifications/:id/read', async (req, res) => {
    const { id } = req.params;
    if (isConnected) {
        try {
            await Notification.findByIdAndUpdate(id, { read: true });
            return res.json({ success: true });
        } catch(e) {}
    }
    if (!localDb.notifications) localDb.notifications = [];
    const idx = localDb.notifications.findIndex(n => String(n._id || n.id) === String(id));
    if (idx !== -1) {
        localDb.notifications[idx].read = true;
        saveLocal();
        return res.json({ success: true });
    }
    res.status(404).json({ success: false, error: 'Notification not found' });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
