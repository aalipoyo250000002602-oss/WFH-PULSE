export interface AttendanceDetails {
  date: string;
  status: "present" | "absent" | "on-leave" | "late";
  clockInTime?: string;
  clockOutTime?: string;
  workDuration?: string;
  lateMinutes?: number;
  effectiveRecordType?: "actual" | "adjusted";
  adjustmentApprovalStatus?: "pending" | "approved" | "denied" | "cancelled" | null;
  overtimeApprovalStatus?: "pending" | "approved" | "denied" | "cancelled" | null;
  leaveDetails?: {
    requestDate: string;
    fromDate: string;
    toDate: string;
    reason: string;
    attachments: string[];
    approvedBy: string;
    approvedDate: string;
  };
}

export interface AttendanceAdjustmentRequest {
  id: string;
  date: string;
  reason: "Forgot to Clock-in/Clock-out" | "Missing logs";
  shiftDateFrom: string;
  shiftDateTo: string;
  clockInTime: string;
  clockOutTime: string;
  breakDuration: number;
  totalWorkDuration: string;
  message: string;
  attachments: string[];
  status: "pending" | "approved" | "denied";
  submittedDate: string;
  approvedBy?: string;
  approvedDate?: string;
  deniedReason?: string;
}

// Helper function to generate random but consistent dates for each employee
const seededRandom = (seed: number) => {
  let x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
};

const generateNovemberAttendance = (employeeIndex: number): Record<string, AttendanceDetails> => {
  const attendance: Record<string, AttendanceDetails> = {};
  
  // Generate random but consistent dates for this employee
  const lateDate1 = Math.floor(seededRandom(employeeIndex * 3) * 11) + 1; // Nov 1-11
  const lateDate2 = Math.floor(seededRandom(employeeIndex * 3 + 1) * 11) + 1;
  const lateDate3 = Math.floor(seededRandom(employeeIndex * 3 + 2) * 11) + 1;
  
  const absentDate = Math.floor(seededRandom(employeeIndex * 5) * 11) + 1;
  const leaveDate = Math.floor(seededRandom(employeeIndex * 7) * 11) + 1;
  
  // Make sure dates don't overlap
  const usedDates = new Set([lateDate1, lateDate2, lateDate3]);
  let finalAbsentDate = absentDate;
  while (usedDates.has(finalAbsentDate)) {
    finalAbsentDate = (finalAbsentDate % 11) + 1;
  }
  usedDates.add(finalAbsentDate);
  
  let finalLeaveDate = leaveDate;
  while (usedDates.has(finalLeaveDate)) {
    finalLeaveDate = (finalLeaveDate % 11) + 1;
  }
  
  // Generate attendance for Nov 1-15 (weekdays only)
  for (let day = 1; day <= 15; day++) {
    const dateStr = `2025-11-${String(day).padStart(2, '0')}`;
    const dayOfWeek = new Date(2025, 10, day).getDay(); // 10 = November (0-indexed)
    
    // Skip weekends (Saturday=6, Sunday=0)
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      continue;
    }
    
    // Check if this is the absent day
    if (day === finalAbsentDate) {
      attendance[dateStr] = {
        date: dateStr,
        status: "absent",
      };
    }
    // Check if this is the leave day
    else if (day === finalLeaveDate) {
      attendance[dateStr] = {
        date: dateStr,
        status: "on-leave",
        workDuration: "8h 0m",
        leaveDetails: {
          requestDate: `2025-10-${25 + (employeeIndex % 5)}`,
          fromDate: dateStr,
          toDate: dateStr,
          reason: ["Medical appointment", "Personal matter", "Family emergency", "Mental health day", "Doctor's appointment"][employeeIndex % 5],
          attachments: ["leave-request.pdf"],
          approvedBy: "Sarah Johnson (HR)",
          approvedDate: `2025-10-${26 + (employeeIndex % 4)} 10:30 AM`,
        },
      };
    }
    // Check if this is one of the late days (3 total, each 1 hour late)
    else if (day === lateDate1 || day === lateDate2 || day === lateDate3) {
      const lateMinutes = 60; // 1 hour late
      const clockInHour = 9 + Math.floor(lateMinutes / 60);
      const clockInMinute = lateMinutes % 60;
      const clockInTime = `${String(clockInHour).padStart(2, '0')}:${String(clockInMinute).padStart(2, '0')}`;
      
      attendance[dateStr] = {
        date: dateStr,
        status: "late",
        clockInTime: clockInTime,
        clockOutTime: "17:30",
        workDuration: "8h 30m",
        lateMinutes: lateMinutes,
      };
    }
    // Regular present day
    else {
      const randomMinute = Math.floor(seededRandom(employeeIndex * 100 + day) * 15) + 45; // 45-59 minutes
      const clockInTime = `08:${String(randomMinute).padStart(2, '0')}`;
      const clockOutMinute = Math.floor(seededRandom(employeeIndex * 200 + day) * 20); // 0-19 minutes
      const clockOutTime = `17:${String(clockOutMinute).padStart(2, '0')}`;
      
      attendance[dateStr] = {
        date: dateStr,
        status: "present",
        clockInTime: clockInTime,
        clockOutTime: clockOutTime,
        workDuration: "8h 15m",
        lateMinutes: 0,
      };
    }
  }
  
  return attendance;
};

const generateJuneAttendance = (employeeIndex: number): Record<string, AttendanceDetails> => {
  const attendance: Record<string, AttendanceDetails> = {};

  const lateDate1 = Math.floor(seededRandom(employeeIndex * 13 + 1) * 19) + 1;
  const lateDate2 = Math.floor(seededRandom(employeeIndex * 13 + 2) * 19) + 1;
  const absentDate = Math.floor(seededRandom(employeeIndex * 17 + 1) * 19) + 1;
  const leaveDate = Math.floor(seededRandom(employeeIndex * 19 + 1) * 19) + 1;

  const usedDates = new Set([lateDate1, lateDate2]);
  let finalAbsentDate = absentDate;
  while (usedDates.has(finalAbsentDate)) finalAbsentDate = (finalAbsentDate % 19) + 1;
  usedDates.add(finalAbsentDate);
  let finalLeaveDate = leaveDate;
  while (usedDates.has(finalLeaveDate)) finalLeaveDate = (finalLeaveDate % 19) + 1;

  // June 2026: June 1=Mon. June 12=Fri = Philippine Independence Day (holiday, skip)
  for (let day = 1; day <= 30; day++) {
    const dateStr = `2026-06-${String(day).padStart(2, '0')}`;
    const dayOfWeek = new Date(2026, 5, day).getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) continue;
    if (day === 12) continue; // Philippine Independence Day

    if (day === finalAbsentDate) {
      attendance[dateStr] = { date: dateStr, status: "absent" };
    } else if (day === finalLeaveDate) {
      attendance[dateStr] = {
        date: dateStr,
        status: "on-leave",
        workDuration: "8h 0m",
        leaveDetails: {
          requestDate: `2026-06-${String(Math.max(1, day - 5)).padStart(2, '0')}`,
          fromDate: dateStr,
          toDate: dateStr,
          reason: ["Medical appointment", "Personal matter", "Family emergency", "Mental health day", "Doctor's appointment"][employeeIndex % 5],
          attachments: ["leave-request.pdf"],
          approvedBy: "Sarah Johnson (HR)",
          approvedDate: `2026-06-${String(Math.max(1, day - 4)).padStart(2, '0')} 10:30 AM`,
        },
      };
    } else if (day === lateDate1 || day === lateDate2) {
      const lateMinutes = 30 + Math.floor(seededRandom(employeeIndex * 50 + day + 600) * 30);
      const clockInHour = 9 + Math.floor(lateMinutes / 60);
      const clockInMinute = lateMinutes % 60;
      attendance[dateStr] = {
        date: dateStr,
        status: "late",
        clockInTime: `${String(clockInHour).padStart(2, '0')}:${String(clockInMinute).padStart(2, '0')}`,
        clockOutTime: "17:30",
        workDuration: "8h 0m",
        lateMinutes,
      };
    } else {
      const randomMinute = Math.floor(seededRandom(employeeIndex * 100 + day + 600) * 15) + 45;
      const clockOutMinute = Math.floor(seededRandom(employeeIndex * 200 + day + 600) * 20);
      attendance[dateStr] = {
        date: dateStr,
        status: "present",
        clockInTime: `08:${String(randomMinute).padStart(2, '0')}`,
        clockOutTime: `17:${String(clockOutMinute).padStart(2, '0')}`,
        workDuration: "8h 15m",
        lateMinutes: 0,
      };
    }
  }
  return attendance;
};

const generateJulyAttendance = (employeeIndex: number): Record<string, AttendanceDetails> => {
  const attendance: Record<string, AttendanceDetails> = {};

  // July 2026: July 1=Wed. July 4=Sat (Independence Day USA - also weekend, no skip needed)
  // Weekdays Jul 1-21: 1, 2, 3, 6, 7, 8, 9, 10, 13, 14, 15, 16, 17, 20, 21
  const lateDate = Math.floor(seededRandom(employeeIndex * 23 + 1) * 13) + 1;
  const absentDate = Math.floor(seededRandom(employeeIndex * 29 + 1) * 13) + 1;

  const usedDates = new Set([lateDate]);
  let finalAbsentDate = absentDate;
  while (usedDates.has(finalAbsentDate)) finalAbsentDate = (finalAbsentDate % 13) + 1;

  for (let day = 1; day <= 21; day++) {
    const dateStr = `2026-07-${String(day).padStart(2, '0')}`;
    const dayOfWeek = new Date(2026, 6, day).getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) continue;

    if (day === finalAbsentDate) {
      attendance[dateStr] = { date: dateStr, status: "absent" };
    } else if (day === lateDate) {
      const lateMinutes = 30 + Math.floor(seededRandom(employeeIndex * 50 + day + 700) * 30);
      const clockInHour = 9 + Math.floor(lateMinutes / 60);
      const clockInMinute = lateMinutes % 60;
      attendance[dateStr] = {
        date: dateStr,
        status: "late",
        clockInTime: `${String(clockInHour).padStart(2, '0')}:${String(clockInMinute).padStart(2, '0')}`,
        clockOutTime: "17:30",
        workDuration: "8h 0m",
        lateMinutes,
      };
    } else {
      const randomMinute = Math.floor(seededRandom(employeeIndex * 100 + day + 700) * 15) + 45;
      const clockOutMinute = Math.floor(seededRandom(employeeIndex * 200 + day + 700) * 20);
      attendance[dateStr] = {
        date: dateStr,
        status: "present",
        clockInTime: `08:${String(randomMinute).padStart(2, '0')}`,
        clockOutTime: `17:${String(clockOutMinute).padStart(2, '0')}`,
        workDuration: "8h 15m",
        lateMinutes: 0,
      };
    }
  }
  return attendance;
};

export const getAttendanceDetailsForEmployee = (employeeIndex: number): Record<string, AttendanceDetails> => {
  const baseData = getAttendanceDetails();
  const novemberData = generateNovemberAttendance(employeeIndex);
  const juneData = generateJuneAttendance(employeeIndex);
  const julyData = generateJulyAttendance(employeeIndex);

  return { ...baseData, ...novemberData, ...juneData, ...julyData };
};

export const getAttendanceDetails = (): Record<string, AttendanceDetails> => ({
  // Week 1 - October 2025
  "2025-10-01": {
    date: "2025-10-01",
    status: "present",
    clockInTime: "08:55",
    clockOutTime: "17:10",
    workDuration: "8h 15m",
    lateMinutes: 0,
  },
  "2025-10-02": {
    date: "2025-10-02",
    status: "present",
    clockInTime: "09:02",
    clockOutTime: "17:05",
    workDuration: "8h 3m",
    lateMinutes: 0,
  },
  "2025-10-03": {
    date: "2025-10-03",
    status: "late",
    clockInTime: "09:15",
    clockOutTime: "17:30",
    workDuration: "8h 15m",
    lateMinutes: 15,
  },
  
  // Week 2
  "2025-10-06": {
    date: "2025-10-06",
    status: "present",
    clockInTime: "08:50",
    clockOutTime: "17:00",
    workDuration: "8h 10m",
    lateMinutes: 0,
  },
  "2025-10-07": {
    date: "2025-10-07",
    status: "present",
    clockInTime: "08:58",
    clockOutTime: "17:15",
    workDuration: "8h 17m",
    lateMinutes: 0,
  },
  "2025-10-08": {
    date: "2025-10-08",
    status: "present",
    clockInTime: "09:00",
    clockOutTime: "17:05",
    workDuration: "8h 5m",
    lateMinutes: 0,
  },
  "2025-10-09": {
    date: "2025-10-09",
    status: "late",
    clockInTime: "09:25",
    clockOutTime: "17:40",
    workDuration: "8h 15m",
    lateMinutes: 25,
  },
  "2025-10-10": {
    date: "2025-10-10",
    status: "present",
    clockInTime: "08:45",
    clockOutTime: "17:00",
    workDuration: "8h 15m",
    lateMinutes: 0,
  },
  
  // Week 3
  "2025-10-13": {
    date: "2025-10-13",
    status: "present",
    clockInTime: "08:55",
    clockOutTime: "17:10",
    workDuration: "8h 15m",
    lateMinutes: 0,
  },
  "2025-10-14": {
    date: "2025-10-14",
    status: "present",
    clockInTime: "09:00",
    clockOutTime: "17:00",
    workDuration: "8h 0m",
    lateMinutes: 0,
  },
  "2025-10-15": {
    date: "2025-10-15",
    status: "absent",
  },
  "2025-10-16": {
    date: "2025-10-16",
    status: "on-leave",
    workDuration: "8h 0m",
    leaveDetails: {
      requestDate: "2025-10-10",
      fromDate: "2025-10-16",
      toDate: "2025-10-16",
      reason: "Personal emergency - family matter",
      attachments: ["medical-certificate.pdf"],
      approvedBy: "Sarah Johnson (HR)",
      approvedDate: "2025-10-11 10:30 AM",
    },
  },
  "2025-10-17": {
    date: "2025-10-17",
    status: "present",
    clockInTime: "08:50",
    clockOutTime: "17:05",
    workDuration: "8h 15m",
    lateMinutes: 0,
  },
  
  // Week 4
  "2025-10-20": {
    date: "2025-10-20",
    status: "present",
    clockInTime: "08:58",
    clockOutTime: "17:10",
    workDuration: "8h 12m",
    lateMinutes: 0,
  },
  "2025-10-21": {
    date: "2025-10-21",
    status: "late",
    clockInTime: "09:20",
    clockOutTime: "17:30",
    workDuration: "8h 10m",
    lateMinutes: 20,
  },
  "2025-10-22": {
    date: "2025-10-22",
    status: "present",
    clockInTime: "08:55",
    clockOutTime: "17:00",
    workDuration: "8h 5m",
    lateMinutes: 0,
  },
  "2025-10-23": {
    date: "2025-10-23",
    status: "present",
    clockInTime: "09:00",
    clockOutTime: "17:15",
    workDuration: "8h 15m",
    lateMinutes: 0,
  },
  "2025-10-24": {
    date: "2025-10-24",
    status: "present",
    clockInTime: "08:52",
    clockOutTime: "17:05",
    workDuration: "8h 13m",
    lateMinutes: 0,
  },
  
  // Week 5
  "2025-10-27": {
    date: "2025-10-27",
    status: "present",
    clockInTime: "08:50",
    clockOutTime: "17:00",
    workDuration: "8h 10m",
    lateMinutes: 0,
  },
  "2025-10-28": {
    date: "2025-10-28",
    status: "present",
    clockInTime: "09:00",
    clockOutTime: "17:10",
    workDuration: "8h 10m",
    lateMinutes: 0,
  },
  "2025-10-29": {
    date: "2025-10-29",
    status: "late",
    clockInTime: "09:18",
    clockOutTime: "17:25",
    workDuration: "8h 7m",
    lateMinutes: 18,
  },
  "2025-10-30": {
    date: "2025-10-30",
    status: "present",
    clockInTime: "08:55",
    clockOutTime: "17:05",
    workDuration: "8h 10m",
    lateMinutes: 0,
  },
  "2025-10-31": {
    date: "2025-10-31",
    status: "present",
    clockInTime: "08:58",
    clockOutTime: "17:00",
    workDuration: "8h 2m",
    lateMinutes: 0,
  },

  // June 2026 - June 1=Mon, June 12=Philippine Independence Day (holiday)
  "2026-06-01": { date: "2026-06-01", status: "present", clockInTime: "08:52", clockOutTime: "17:05", workDuration: "8h 13m", lateMinutes: 0 },
  "2026-06-02": { date: "2026-06-02", status: "present", clockInTime: "09:00", clockOutTime: "17:10", workDuration: "8h 10m", lateMinutes: 0 },
  "2026-06-03": { date: "2026-06-03", status: "present", clockInTime: "08:48", clockOutTime: "17:00", workDuration: "8h 12m", lateMinutes: 0 },
  "2026-06-04": { date: "2026-06-04", status: "present", clockInTime: "08:55", clockOutTime: "17:05", workDuration: "8h 10m", lateMinutes: 0 },
  "2026-06-05": { date: "2026-06-05", status: "late",    clockInTime: "09:20", clockOutTime: "17:30", workDuration: "8h 10m", lateMinutes: 20 },
  "2026-06-08": { date: "2026-06-08", status: "present", clockInTime: "08:50", clockOutTime: "17:00", workDuration: "8h 10m", lateMinutes: 0 },
  "2026-06-09": { date: "2026-06-09", status: "present", clockInTime: "09:05", clockOutTime: "17:15", workDuration: "8h 10m", lateMinutes: 0 },
  "2026-06-10": { date: "2026-06-10", status: "present", clockInTime: "08:55", clockOutTime: "17:05", workDuration: "8h 10m", lateMinutes: 0 },
  "2026-06-11": { date: "2026-06-11", status: "absent" },
  // June 12 = Independence Day Philippines (holiday - no record)
  "2026-06-15": {
    date: "2026-06-15",
    status: "on-leave",
    workDuration: "8h 0m",
    leaveDetails: {
      requestDate: "2026-06-10",
      fromDate: "2026-06-15",
      toDate: "2026-06-15",
      reason: "Medical appointment",
      attachments: ["medical-certificate.pdf"],
      approvedBy: "Sarah Johnson (HR)",
      approvedDate: "2026-06-11 10:30 AM",
    },
  },
  "2026-06-16": { date: "2026-06-16", status: "present", clockInTime: "09:00", clockOutTime: "17:00", workDuration: "8h 0m",  lateMinutes: 0 },
  "2026-06-17": { date: "2026-06-17", status: "present", clockInTime: "08:52", clockOutTime: "17:10", workDuration: "8h 18m", lateMinutes: 0 },
  "2026-06-18": { date: "2026-06-18", status: "present", clockInTime: "09:00", clockOutTime: "17:05", workDuration: "8h 5m",  lateMinutes: 0 },
  "2026-06-19": { date: "2026-06-19", status: "late",    clockInTime: "09:35", clockOutTime: "18:00", workDuration: "8h 25m", lateMinutes: 35 },
  "2026-06-22": { date: "2026-06-22", status: "present", clockInTime: "08:50", clockOutTime: "17:00", workDuration: "8h 10m", lateMinutes: 0 },
  "2026-06-23": { date: "2026-06-23", status: "present", clockInTime: "08:58", clockOutTime: "17:15", workDuration: "8h 17m", lateMinutes: 0 },
  "2026-06-24": { date: "2026-06-24", status: "present", clockInTime: "09:00", clockOutTime: "17:00", workDuration: "8h 0m",  lateMinutes: 0 },
  "2026-06-25": { date: "2026-06-25", status: "present", clockInTime: "08:55", clockOutTime: "17:05", workDuration: "8h 10m", lateMinutes: 0 },
  "2026-06-26": { date: "2026-06-26", status: "present", clockInTime: "08:50", clockOutTime: "17:00", workDuration: "8h 10m", lateMinutes: 0 },
  "2026-06-29": { date: "2026-06-29", status: "present", clockInTime: "09:02", clockOutTime: "17:10", workDuration: "8h 8m",  lateMinutes: 0 },
  "2026-06-30": { date: "2026-06-30", status: "present", clockInTime: "08:55", clockOutTime: "17:05", workDuration: "8h 10m", lateMinutes: 0 },

  // July 2026 (up to Jul 21) - July 1=Wed, July 4=Sat (Independence Day USA)
  "2026-07-01": { date: "2026-07-01", status: "present", clockInTime: "08:55", clockOutTime: "17:05", workDuration: "8h 10m", lateMinutes: 0 },
  "2026-07-02": { date: "2026-07-02", status: "present", clockInTime: "09:00", clockOutTime: "17:10", workDuration: "8h 10m", lateMinutes: 0 },
  "2026-07-03": { date: "2026-07-03", status: "present", clockInTime: "08:48", clockOutTime: "17:00", workDuration: "8h 12m", lateMinutes: 0 },
  // July 4 = Sat (holiday Independence Day USA) - no record
  "2026-07-06": { date: "2026-07-06", status: "present", clockInTime: "08:55", clockOutTime: "17:05", workDuration: "8h 10m", lateMinutes: 0 },
  "2026-07-07": { date: "2026-07-07", status: "late",    clockInTime: "09:15", clockOutTime: "17:30", workDuration: "8h 15m", lateMinutes: 15 },
  "2026-07-08": { date: "2026-07-08", status: "present", clockInTime: "08:50", clockOutTime: "17:00", workDuration: "8h 10m", lateMinutes: 0 },
  "2026-07-09": { date: "2026-07-09", status: "present", clockInTime: "09:05", clockOutTime: "17:15", workDuration: "8h 10m", lateMinutes: 0 },
  "2026-07-10": { date: "2026-07-10", status: "present", clockInTime: "08:55", clockOutTime: "17:05", workDuration: "8h 10m", lateMinutes: 0 },
  "2026-07-13": { date: "2026-07-13", status: "present", clockInTime: "09:00", clockOutTime: "17:00", workDuration: "8h 0m",  lateMinutes: 0 },
  "2026-07-14": {
    date: "2026-07-14",
    status: "on-leave",
    workDuration: "8h 0m",
    leaveDetails: {
      requestDate: "2026-07-09",
      fromDate: "2026-07-14",
      toDate: "2026-07-14",
      reason: "Annual medical check-up",
      attachments: ["appointment-slip.pdf"],
      approvedBy: "Sarah Johnson (HR)",
      approvedDate: "2026-07-10 09:00 AM",
    },
  },
  "2026-07-15": { date: "2026-07-15", status: "absent" },
  "2026-07-16": { date: "2026-07-16", status: "present", clockInTime: "08:52", clockOutTime: "17:10", workDuration: "8h 18m", lateMinutes: 0 },
  "2026-07-17": { date: "2026-07-17", status: "present", clockInTime: "08:58", clockOutTime: "17:05", workDuration: "8h 7m",  lateMinutes: 0 },
  "2026-07-20": { date: "2026-07-20", status: "late",    clockInTime: "09:25", clockOutTime: "17:40", workDuration: "8h 15m", lateMinutes: 25 },
  "2026-07-21": { date: "2026-07-21", status: "present", clockInTime: "08:50", clockOutTime: "17:00", workDuration: "8h 10m", lateMinutes: 0 },
});

export const getInitialAdjustmentRequests = (): AttendanceAdjustmentRequest[] => [
  {
    id: "adj-att-001",
    date: "2025-10-15",
    reason: "Forgot to Clock-in/Clock-out",
    shiftDateFrom: "2025-10-15",
    shiftDateTo: "2025-10-15",
    clockInTime: "09:00",
    clockOutTime: "17:00",
    breakDuration: 60,
    totalWorkDuration: "8h 0m",
    message: "I forgot to clock in this morning due to urgent meeting. I arrived at 9:00 AM and left at 5:00 PM.",
    attachments: ["meeting-invite.pdf"],
    status: "approved",
    submittedDate: "2025-10-15 18:30",
    approvedBy: "Sarah Johnson (HR)",
    approvedDate: "2025-10-16 09:15 AM",
  },
  {
    id: "adj-att-002",
    date: "2025-10-22",
    reason: "Missing logs",
    shiftDateFrom: "2025-10-22",
    shiftDateTo: "2025-10-22",
    clockInTime: "08:30",
    clockOutTime: "17:30",
    breakDuration: 60,
    totalWorkDuration: "9h 0m",
    message: "System malfunction prevented proper clock-in/out logging. I have email timestamps as proof.",
    attachments: ["email-timestamps.pdf"],
    status: "pending",
    submittedDate: "2025-10-22 17:45",
  },
];
