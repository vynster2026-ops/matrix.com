const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const rootDir = __dirname;

const copyMap = [
    // Salon Admin Portal
    { src: 'vynster-salon.html', targets: ['www/vynster-salon.html', 'syncadminstaff/vynster-salon.html', 'staff-dashboard/vynster-salon.html'] },
    
    // Staff Hub Portal
    { src: 'vynster-staff.html', targets: [
        'www/vynster-staff.html', 
        'syncadminstaff/vynster-staff.html', 
        'staff-dashboard/vynster-staff.html',
        'staff-dashboard/staff.html',
        'www/staff.html',
        'syncadminstaff/staff.html',
        'staff.html',
        'www/MedhikaArts_staff_module.html'
    ] },

    // Booking Portal
    { src: 'vynster-booking.html', targets: [
        'www/vynster-booking.html', 
        'syncadminstaff/vynster-booking.html', 
        'staff-dashboard/vynster-booking.html',
        'www/MedhikaArts_booking_module.html',
        'staff-dashboard/MedhikaArts_booking_module.html',
        'syncadminstaff/MedhikaArts_booking_module.html'
    ] },

    // Demo & Complete Module Portal
    { src: 'vynster-demo.html', targets: [
        'www/vynster-demo.html', 
        'syncadminstaff/vynster-demo.html', 
        'staff-dashboard/vynster-demo.html',
        'www/MedhikaArts_complete_module.html',
        'syncadminstaff/MedhikaArts_complete_module.html',
        'staff-dashboard/syncadminstaff/MedhikaArts_complete_module.html'
    ] },

    // Matrix Super Admin Portal
    { src: 'matrix.html', targets: ['www/matrix.html', 'syncadminstaff/matrix.html', 'staff-dashboard/matrix.html'] },

    // Core Scripts & Utilities
    { src: 'server.js', targets: ['syncadminstaff/server.js', 'staff-dashboard/server.js'] },
    { src: 'app.js', targets: ['www/app.js', 'syncadminstaff/app.js', 'staff-dashboard/app.js'] },
    { src: 'data.js', targets: ['www/data.js', 'syncadminstaff/data.js', 'staff-dashboard/data.js'] },
    { src: 'vynster-sync.js', targets: ['www/vynster-sync.js', 'syncadminstaff/vynster-sync.js', 'staff-dashboard/vynster-sync.js'] },

    // Authentication & Auxiliary Files
    { src: 'vynster-logo.png', targets: ['www/vynster-logo.png', 'syncadminstaff/vynster-logo.png', 'staff-dashboard/vynster-logo.png'] },
    { src: 'superadmin_login.html', targets: ['www/superadmin_login.html', 'syncadminstaff/superadmin_login.html', 'staff-dashboard/superadmin_login.html'] },
    { src: 'index.html', targets: ['www/index.html', 'syncadminstaff/index.html'] },
    { src: 'landing.html', targets: ['www/landing.html', 'syncadminstaff/landing.html', 'staff-dashboard/landing.html'] },
    { src: '_worker.js', targets: ['www/_worker.js'] },
    { src: '_redirects', targets: ['www/_redirects'] },
    { src: '.assetsignore', targets: ['www/.assetsignore'] },
    { src: 'login.html', targets: ['www/login.html', 'staff-dashboard/login.html'] },
    { src: 'staff-login.html', targets: ['www/staff-login.html', 'syncadminstaff/staff-login.html', 'staff-dashboard/staff-login.html'] },
    { src: 'bd.html', targets: ['www/bd.html', 'syncadminstaff/bd.html', 'staff-dashboard/bd.html'] },
    { src: 'whatsapp.html', targets: ['www/whatsapp.html', 'syncadminstaff/whatsapp.html'] }
];

function getHash(filePath) {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
}

console.log('🔄 Starting Project Portal Synchronization...\n');

let totalCopied = 0;
let errors = 0;

copyMap.forEach(({ src, targets }) => {
    const srcPath = path.join(rootDir, src);
    if (!fs.existsSync(srcPath)) {
        console.error(`⚠️ Source file missing: ${src}`);
        errors++;
        return;
    }

    const srcHash = getHash(srcPath);

    targets.forEach(targetRel => {
        const targetPath = path.join(rootDir, targetRel);
        const targetDir = path.dirname(targetPath);

        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        const targetHash = getHash(targetPath);

        if (srcHash !== targetHash) {
            try {
                fs.copyFileSync(srcPath, targetPath);
                console.log(`✅ Synced: ${src} -> ${targetRel}`);
                totalCopied++;
            } catch (err) {
                console.error(`❌ Failed to sync to ${targetRel}:`, err.message);
                errors++;
            }
        } else {
            console.log(`⚡ In sync: ${targetRel}`);
        }
    });
});

console.log(`\n🎉 Synchronization finished: ${totalCopied} files updated, ${errors} errors.`);
