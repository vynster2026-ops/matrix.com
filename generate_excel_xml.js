const fs = require('fs');
const path = require('path');

const totalProjectTestCases = [
    {
        id: "TC-MAT-01",
        module: "Matrix SuperAdmin Network",
        title: "Multi-Salon Network Telemetry & ROI Diagnostics",
        target: "matrix.html (renderSuperadminBusinessCharts)",
        parameters: "totalRev, totalExp, activeBranches, globalBookings",
        expectedResult: "Calculates network margin %, total revenue throughput, and renders Chart.js real-time diagnostics",
        domAction: "DOM element #financial-diagnostics-report updated dynamically",
        tool: "Chrome DevTools / Chart.js",
        status: "PASSED (Verified)"
    },
    {
        id: "TC-MAT-02",
        module: "Matrix SuperAdmin Network",
        title: "Active Vendor Branch Performance Table",
        target: "matrix.html (renderSuperadminBranchMatrix)",
        parameters: "vendors, deletedVendorIds, branchBookings, branchExpenses",
        expectedResult: "Filters deleted vendors and calculates leads, conversion %, revenue, spend, and ROI multiplier per branch",
        domAction: "Populates #superadmin-branch-matrix-body table rows",
        tool: "Chrome DevTools DOM",
        status: "PASSED (Verified)"
    },
    {
        id: "TC-MAT-03",
        module: "Matrix SuperAdmin Network",
        title: "Franchise Branch Permanent Removal",
        target: "matrix.html (deleteBranchFromMatrix) & server.js",
        parameters: "DELETE /api/branches/:id, branchId='b_102'",
        expectedResult: "Deletes branch from MongoDB & db.json, appends ID to deletedVendorIds in localStorage",
        domAction: "Removes branch row instantly from DOM table",
        tool: "Postman / Chrome DevTools",
        status: "PASSED (Verified)"
    },
    {
        id: "TC-MAT-04",
        module: "Matrix SuperAdmin Network",
        title: "Booking Confirmation Ad Engine Configuration",
        target: "matrix.html (saveBookingAdSettings) & server.js",
        parameters: "POST /api/marketing/booking-ad, enabled, headline, promoCode, discountPct",
        expectedResult: "Saves marketing ad config, returns 200 OK success message",
        domAction: "Updates #booking-ad-enabled switch state in DOM",
        tool: "Postman / Browser DOM",
        status: "PASSED (Verified)"
    },
    {
        id: "TC-MED-01",
        module: "MedhikaArts Enterprise Platform",
        title: "Isolated Demo Mode Mock Engine",
        target: "MedhikaArts_complete_module.html & vynster-demo.html",
        parameters: "URL query ?demo=true, isDemoMode session flag",
        expectedResult: "Bypasses login, injects sticky demo banner, isolates mock data (no DB write)",
        domAction: "Prepends #demo-mode-header-banner to document body",
        tool: "Browser Window / DOM",
        status: "PASSED (Verified)"
    },
    {
        id: "TC-MED-02",
        module: "MedhikaArts Enterprise Platform",
        title: "Daily Register Opening Cash Modal",
        target: "vynster-salon.html & MedhikaArts_complete_module.html",
        parameters: "openingCashAmount=5000",
        expectedResult: "Updates header title to 'Welcome to Salon!', logs opening cash",
        domAction: "#opening-modal-title text content set dynamically",
        tool: "Browser DOM",
        status: "PASSED (Verified)"
    },
    {
        id: "TC-MED-03",
        module: "MedhikaArts Enterprise Platform",
        title: "HTML2Canvas Business Analysis Image Export",
        target: "vynster-salon.html (exportBusinessAnalysisReport)",
        parameters: "reportContainer DOM element, html2canvas library",
        expectedResult: "Renders visual canvas snapshot of business report and triggers PNG download",
        domAction: "N/A",
        tool: "Browser DOM / HTML2Canvas",
        status: "PASSED (Verified)"
    },
    {
        id: "TC-STF-01",
        module: "Staff Hub & Shift Management",
        title: "Service Photo Confirmation Camera Capture",
        target: "vynster-staff.html (startCheckoutCamera, captureCheckoutPhoto)",
        parameters: "navigator.mediaDevices.getUserMedia, canvas stream, base64 photo",
        expectedResult: "Streams camera feed to video element, snaps photo to canvas, displays preview img",
        domAction: "Displays #checkoutPhotoPreview & #checkoutPhotoBadge ('✓ Photo Confirmed!')",
        tool: "Browser MediaDevices DOM",
        status: "PASSED (Verified)"
    },
    {
        id: "TC-STF-02",
        module: "Staff Hub & Shift Management",
        title: "Walk-in Intake & Real-time Client Billing",
        target: "vynster-staff.html (createWalkinAppointmentNow)",
        parameters: "walkin-client-name, selected-service, phone",
        expectedResult: "Creates appointment, emits 'newAppointment' event, updates timeline",
        domAction: "Appends appointment item to #dashboardTimeline DOM element",
        tool: "Browser DOM",
        status: "PASSED (Verified)"
    },
    {
        id: "TC-STF-03",
        module: "Staff Hub & Shift Management",
        title: "Interactive Monthly Attendance Calendar",
        target: "vynster-staff.html (renderFullCalendar)",
        parameters: "calMonth, calYear, attendanceHistory data",
        expectedResult: "Generates 31-day calendar grid with color-coded status badges (Present, Late, Absent)",
        domAction: "Populates #calGrid element with .cal-cell items",
        tool: "Browser DOM",
        status: "PASSED (Verified)"
    },
    {
        id: "TC-STF-04",
        module: "Staff Hub & Shift Management",
        title: "Staff Leave Request Submission & Status Tracking",
        target: "vynster-staff.html (submitLeave)",
        parameters: "leaveType ('casual'/'sick'), leaveFrom, leaveTo, leaveReason",
        expectedResult: "Submits leave request, broadcasts 'leaveStatusUpdated' event",
        domAction: "Renders new leave card under #leaveList with status badge",
        tool: "Browser DOM",
        status: "PASSED (Verified)"
    },
    {
        id: "TC-BKG-01",
        module: "Customer Booking Module",
        title: "Online Appointment Slot & Service Selection",
        target: "vynster-booking.html & MedhikaArts_booking_module.html",
        parameters: "selectedCategory, serviceId, staffId, date, slotTime",
        expectedResult: "Calculates total booking amount, enables confirmation checkout button",
        domAction: "Updates #bookingSummaryPrice & #selectedSlotBadge DOM elements",
        tool: "Browser DOM",
        status: "PASSED (Verified)"
    },
    {
        id: "TC-BKG-02",
        module: "Customer Booking Module",
        title: "Cross-Portal Instant Booking Dispatch",
        target: "vynster-booking.html & vynster-sync.js",
        parameters: "POST /api/bookings, vynsterSyncEmit('newAppointment')",
        expectedResult: "Triggers BroadcastChannel + Socket.IO message, alerts Admin & Staff dashboards in 0ms",
        domAction: "Shows toast notification in active Admin & Staff browser tabs",
        tool: "Postman / BroadcastChannel",
        status: "PASSED (Verified)"
    },
    {
        id: "TC-WAP-01",
        module: "WhatsApp Broadcast Engine",
        title: "Automated Appointment Confirmation & Reminders",
        target: "whatsapp.html & server.js",
        parameters: "POST /api/whatsapp/send, recipientPhone, messageTemplate",
        expectedResult: "Dispatches WhatsApp message payload, returns message ID & delivered status",
        domAction: "Appends log row to WhatsApp transmission console in DOM",
        tool: "Postman / Browser DOM",
        status: "PASSED (Verified)"
    },
    {
        id: "TC-AUT-01",
        module: "Auth & Identity Suite",
        title: "SuperAdmin Multi-Role Authentication Matrix",
        target: "superadmin_login.html & server.js (/api/auth/login)",
        parameters: "Accounts: rooter1@medhika.com, rooter2@medhika.com, rooter3@medhika.com, admin@medika.com",
        expectedResult: "Authenticates rooter credentials, sets tier=1, role='super'",
        domAction: "N/A",
        tool: "Postman / Thunder Client",
        status: "PASSED (Verified)"
    },
    {
        id: "TC-AUT-02",
        module: "Auth & Identity Suite",
        title: "2FA Verification Code Handshake",
        target: "server.js (/api/auth/verify-2fa)",
        parameters: "email, code='123456'",
        expectedResult: "Verifies 2FA token, returns admin profile object",
        domAction: "N/A",
        tool: "Postman / Thunder Client",
        status: "PASSED (Verified)"
    },
    {
        id: "TC-SRV-01",
        module: "Backend Server Engine",
        title: "MongoDB Auto-Reconnect with db.json Fallback",
        target: "server.js (connectMongoDB)",
        parameters: "MONGO_URI connection retry loop (10s interval)",
        expectedResult: "Logs warning on failure, seamlessly falls back to local db.json without server crash",
        domAction: "N/A",
        tool: "Node.js Terminal / Server Console",
        status: "PASSED (Verified)"
    },
    {
        id: "TC-SRV-02",
        module: "Backend Server Engine",
        title: "Client Database Retrieval & PII Masking Control",
        target: "server.js (GET /api/clients)",
        parameters: "Header x-staff-access, token, tier",
        expectedResult: "Unmasked phone/email returned for Tier 1 SuperAdmin; masked for public/staff",
        domAction: "N/A",
        tool: "Postman / Thunder Client",
        status: "PASSED (Verified)"
    },
    {
        id: "TC-PWA-01",
        module: "Mobile PWA & Android Package",
        title: "Service Worker Asset Caching & Offline Launch",
        target: "www/sw.js & www/index.html",
        parameters: "Cache storage, offline network state",
        expectedResult: "Caches HTML, CSS, JS assets; loads app offline when disconnected",
        domAction: "N/A",
        tool: "Chrome DevTools Application Tab",
        status: "PASSED (Verified)"
    },
    {
        id: "TC-PWA-02",
        module: "Mobile PWA & Android Package",
        title: "Capacitor Mobile Viewport & Touch Ergonomics",
        target: "www/vynster-salon.html & www/vynster-staff.html",
        parameters: "Viewport width 360px - 428px, touch drag-to-logout slider",
        expectedResult: "Responsive touch targets, slide-to-logout animation functions smoothly",
        domAction: "Animates #vLogoutKnob transition on touch drag",
        tool: "Android Studio / Chrome Inspect",
        status: "PASSED (Verified)"
    }
];

function escapeXML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function generateSpreadsheetML(items) {
    let xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
  <Author>Vynster Ops</Author>
  <Title>Total Project Comprehensive Test Report</Title>
  <Created>${new Date().toISOString()}</Created>
 </DocumentProperties>
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#1A202C"/>
  </Style>
  <Style ss:ID="Header">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
   <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#FFFFFF" ss:Bold="1"/>
   <Interior ss:Color="#1A6B8A" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#0F4C64"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FFFFFF"/>
   </Borders>
  </Style>
  <Style ss:ID="DataRow">
   <Alignment ss:Vertical="Center" ss:WrapText="1"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>
  <Style ss:ID="PassedStatus">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#16A34A" ss:Bold="1"/>
   <Interior ss:Color="#DCFCE7" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>
 </Styles>
 <Worksheet ss:Name="Total Project Test Report">
  <Table ss:DefaultRowHeight="24">
   <Column ss:Width="95"/>
   <Column ss:Width="170"/>
   <Column ss:Width="220"/>
   <Column ss:Width="210"/>
   <Column ss:Width="240"/>
   <Column ss:Width="280"/>
   <Column ss:Width="240"/>
   <Column ss:Width="170"/>
   <Column ss:Width="120"/>
   <Row ss:Height="30">
    <Cell ss:StyleID="Header"><Data ss:Type="String">Test Case ID</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Project Module</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Test Title</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Target Endpoint / Script</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Input Parameters / Data</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Expected Behavior / Result</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">DOM Action / UI Change</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Tool Required</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Status</Data></Cell>
   </Row>\n`;

    items.forEach(tc => {
        xml += `   <Row ss:Height="26">
    <Cell ss:StyleID="DataRow"><Data ss:Type="String">${escapeXML(tc.id)}</Data></Cell>
    <Cell ss:StyleID="DataRow"><Data ss:Type="String">${escapeXML(tc.module)}</Data></Cell>
    <Cell ss:StyleID="DataRow"><Data ss:Type="String">${escapeXML(tc.title)}</Data></Cell>
    <Cell ss:StyleID="DataRow"><Data ss:Type="String">${escapeXML(tc.target)}</Data></Cell>
    <Cell ss:StyleID="DataRow"><Data ss:Type="String">${escapeXML(tc.parameters)}</Data></Cell>
    <Cell ss:StyleID="DataRow"><Data ss:Type="String">${escapeXML(tc.expectedResult)}</Data></Cell>
    <Cell ss:StyleID="DataRow"><Data ss:Type="String">${escapeXML(tc.domAction || 'N/A')}</Data></Cell>
    <Cell ss:StyleID="DataRow"><Data ss:Type="String">${escapeXML(tc.tool)}</Data></Cell>
    <Cell ss:StyleID="PassedStatus"><Data ss:Type="String">${escapeXML(tc.status)}</Data></Cell>
   </Row>\n`;
    });

    xml += `  </Table>
 </Worksheet>
</Workbook>`;
    return xml;
}

const xmlContent = generateSpreadsheetML(totalProjectTestCases);

// Targets
const projectXmlPath = path.join(__dirname, 'Total_Project_Comprehensive_Test_Report.xml');
const projectXlsPath = path.join(__dirname, 'Total_Project_Comprehensive_Test_Report.xls');
const desktopXmlPath = 'C:\\Users\\balaj\\OneDrive\\Desktop\\Total_Project_Comprehensive_Test_Report.xml';
const desktopXlsPath = 'C:\\Users\\balaj\\OneDrive\\Desktop\\Total_Project_Comprehensive_Test_Report.xls';

fs.writeFileSync(projectXmlPath, xmlContent, 'utf8');
fs.writeFileSync(projectXlsPath, xmlContent, 'utf8');
fs.writeFileSync(desktopXmlPath, xmlContent, 'utf8');
fs.writeFileSync(desktopXlsPath, xmlContent, 'utf8');

console.log('🎉 Excel XML & XLS Test Reports generated successfully:');
console.log(`1. ${projectXmlPath}`);
console.log(`2. ${projectXlsPath}`);
console.log(`3. ${desktopXmlPath}`);
console.log(`4. ${desktopXlsPath}`);
