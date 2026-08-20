const liveBookings = [
  {
    "id": "GS-91106",
    "clientId": "c800",
    "clientName": "Sandra Pavani",
    "services": [
      "svc-1778241632094",
      "svc-1778241632095",
      "svc-1778241632096"
    ],
    "staffId": [
      "STF-EFMCE1"
    ],
    "date": "2026-08-14",
    "time": "13:00"
  }
];

const staffIdSet = new Set(["stf-efmce1"]);
const realStaffName = "sriya";

const myBks = liveBookings.filter(b => {
  const bStaffIds = Array.isArray(b.staffId)
    ? b.staffId.map(x => String(x).toLowerCase().trim()).filter(Boolean)
    : [String(b.staffId || b.stylistId || '').toLowerCase().trim()].filter(Boolean);
  const bStaffName = String(b.staff || b.stylist || b.assignedStaff || b.staffName || b.stylistName || '').toLowerCase().trim();

  if (bStaffIds.some(sid => staffIdSet.has(sid) || Array.from(staffIdSet).some(s => s && (sid.includes(s) || s.includes(sid))))) return true;
  
  if (realStaffName && bStaffName) {
    if (bStaffName === realStaffName || bStaffName.split(' ').includes(realStaffName) || realStaffName.split(' ').includes(bStaffName)) return true;
  }
  return false;
});

console.log("Filtered Bookings:", myBks.length);
