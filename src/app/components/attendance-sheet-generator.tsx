import { useState, useEffect, useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Calendar } from "./ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { ScrollArea } from "./ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Switch } from "./ui/switch";
import logoImage from "figma:asset/80b7a2d7f7164e79d1aa41e678d57bd410cbb0ae.png";
import {
  FileText,
  Search,
  Calendar as CalendarIcon,
  Download,
  Clock,
  AlertCircle,
  User,
  Wallet,
  DollarSign,
  Users,
  ArrowUpDown,
  Eye,
  X,
  Mail,
  Send,
  CheckCircle,
} from "lucide-react";
import {
  getEmployees,
  Employee,
  syncEmployeesWithEmploymentOptions,
} from "./employee-data";
import { toast } from "sonner";
import { format } from "date-fns";

// Generate random late dates for October 2025 for each employee
// Each employee gets 6 random dates where they'll be 1 hour late (total 6 hours)
const generateLateDatesForEmployee = (
  employeeId: string,
): Set<number> => {
  const empNum = parseInt(employeeId.replace("emp-", ""));
  const lateDates = new Set<number>();

  // Use employee number as seed for consistent random dates
  let seed = empNum;
  const random = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  // Generate 6 random dates (excluding weekends)
  const weekdays = [
    1, 2, 3, 4, 7, 8, 9, 10, 11, 14, 15, 16, 17, 18, 21, 22, 23,
    24, 25, 28, 29, 30, 31,
  ]; // October 2025 weekdays

  while (lateDates.size < 6) {
    const randomIndex = Math.floor(random() * weekdays.length);
    lateDates.add(weekdays[randomIndex]);
  }

  return lateDates;
};

// Generate random late dates for November 1-15, 2025 for each employee
// Each employee gets 3 random dates where they'll be 1 hour late (total 3 hours)
const generateNovemberLateDatesForEmployee = (
  employeeId: string,
): Set<number> => {
  const empNum = parseInt(employeeId.replace("emp-", ""));
  const lateDates = new Set<number>();

  // Use employee number as seed for consistent random dates
  let seed = empNum * 100;
  const random = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  // November 1-15, 2025 weekdays (excluding weekends)
  const weekdays = [1, 3, 4, 5, 6, 7, 10, 11, 12, 13, 14]; // Skips 2, 8, 9, 15 (Sat/Sun)

  while (lateDates.size < 3) {
    const randomIndex = Math.floor(random() * weekdays.length);
    lateDates.add(weekdays[randomIndex]);
  }

  return lateDates;
};

// Generate random absent date for November 1-15, 2025 for each employee
const generateNovemberAbsentDateForEmployee = (
  employeeId: string,
): number => {
  const empNum = parseInt(employeeId.replace("emp-", ""));
  let seed = empNum * 200;
  const random = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  const weekdays = [1, 3, 4, 5, 6, 7, 10, 11, 12, 13, 14];
  const randomIndex = Math.floor(random() * weekdays.length);
  return weekdays[randomIndex];
};

// Generate random leave date for November 1-15, 2025 for each employee
const generateNovemberLeaveDateForEmployee = (
  employeeId: string,
  lateDates: Set<number>,
  absentDate: number,
): number => {
  const empNum = parseInt(employeeId.replace("emp-", ""));
  let seed = empNum * 300;
  const random = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  const weekdays = [1, 3, 4, 5, 6, 7, 10, 11, 12, 13, 14];
  let leaveDate: number;
  let attempts = 0;
  
  // Find a date that doesn't conflict with late dates or absent date
  do {
    const randomIndex = Math.floor(random() * weekdays.length);
    leaveDate = weekdays[randomIndex];
    attempts++;
  } while ((lateDates.has(leaveDate) || leaveDate === absentDate) && attempts < 20);

  return leaveDate;
};

// Store late dates for each employee (memoization)
const employeeLateDatesCache = new Map<string, Set<number>>();
const employeeNovemberLateDatesCache = new Map<string, Set<number>>();
const employeeNovemberAbsentDateCache = new Map<string, number>();
const employeeNovemberLeaveDateCache = new Map<string, number>();

const getEmployeeLateDates = (
  employeeId: string,
): Set<number> => {
  if (!employeeLateDatesCache.has(employeeId)) {
    employeeLateDatesCache.set(
      employeeId,
      generateLateDatesForEmployee(employeeId),
    );
  }
  return employeeLateDatesCache.get(employeeId)!;
};

const getEmployeeNovemberLateDates = (
  employeeId: string,
): Set<number> => {
  if (!employeeNovemberLateDatesCache.has(employeeId)) {
    employeeNovemberLateDatesCache.set(
      employeeId,
      generateNovemberLateDatesForEmployee(employeeId),
    );
  }
  return employeeNovemberLateDatesCache.get(employeeId)!;
};

const getEmployeeNovemberAbsentDate = (
  employeeId: string,
): number => {
  if (!employeeNovemberAbsentDateCache.has(employeeId)) {
    employeeNovemberAbsentDateCache.set(
      employeeId,
      generateNovemberAbsentDateForEmployee(employeeId),
    );
  }
  return employeeNovemberAbsentDateCache.get(employeeId)!;
};

const getEmployeeNovemberLeaveDate = (
  employeeId: string,
  lateDates: Set<number>,
  absentDate: number,
): number => {
  if (!employeeNovemberLeaveDateCache.has(employeeId)) {
    employeeNovemberLeaveDateCache.set(
      employeeId,
      generateNovemberLeaveDateForEmployee(employeeId, lateDates, absentDate),
    );
  }
  return employeeNovemberLeaveDateCache.get(employeeId)!;
};

// Generate mock attendance data for each employee across different dates
const generateAttendanceData = (
  employeeId: string,
  date: Date,
) => {
  // Create consistent but varied attendance data based on employee ID and date
  const seed =
    parseInt(employeeId.replace("emp-", "")) +
    date.getDate() +
    date.getMonth() * 31;
  const random = Math.sin(seed) * 10000;
  const randomValue = random - Math.floor(random);

  const isOctober2025 =
    date.getFullYear() === 2025 && date.getMonth() === 9; // October is month 9 (0-indexed)
  const isNovember2025 =
    date.getFullYear() === 2025 && date.getMonth() === 10 && date.getDate() <= 15; // November 1-15
  
  const lateDates = isOctober2025
    ? getEmployeeLateDates(employeeId)
    : new Set<number>();

  // Handle November 1-15, 2025 with specific rules
  if (isNovember2025) {
    const novemberLateDates = getEmployeeNovemberLateDates(employeeId);
    const novemberAbsentDate = getEmployeeNovemberAbsentDate(employeeId);
    const novemberLeaveDate = getEmployeeNovemberLeaveDate(employeeId, novemberLateDates, novemberAbsentDate);
    const currentDay = date.getDate();

    // Check if this is the absent day
    if (currentDay === novemberAbsentDate) {
      return {
        date: format(date, "yyyy-MM-dd"),
        status: "absent" as const,
        clockInTime: undefined,
        clockOutTime: undefined,
        workDuration: "0h 0m",
        isLate: false,
        lateMinutes: 0,
      };
    }

    // Check if this is the leave day
    if (currentDay === novemberLeaveDate) {
      return {
        date: format(date, "yyyy-MM-dd"),
        status: "on-leave" as const,
        clockInTime: undefined,
        clockOutTime: undefined,
        workDuration: "8h 0m",
        isLate: false,
        lateMinutes: 0,
      };
    }

    // Check if this is a late day (3 days, 1 hour each)
    if (novemberLateDates.has(currentDay)) {
      const clockInTime = new Date(date);
      clockInTime.setHours(10, 0, 0); // 1 hour late (10:00 AM instead of 9:00 AM)

      const clockOutTime = new Date(date);
      clockOutTime.setHours(17, 30, 0); // Clock out at 5:30 PM

      return {
        date: format(date, "yyyy-MM-dd"),
        status: "present" as const,
        clockInTime: format(clockInTime, "h:mm a"),
        clockOutTime: format(clockOutTime, "h:mm a"),
        workDuration: "7h 30m",
        isLate: true,
        lateMinutes: 60,
      };
    }

    // Regular present day for November
    const clockInHour = 8;
    const clockInMinute = Math.floor(randomValue * 45);
    const clockOutHour = 17;
    const clockOutMinute = Math.floor(randomValue * 60);

    const clockInTime = new Date(date);
    clockInTime.setHours(clockInHour, clockInMinute, 0);

    const clockOutTime = new Date(date);
    clockOutTime.setHours(clockOutHour, clockOutMinute, 0);

    const durationMs = clockOutTime.getTime() - clockInTime.getTime();
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));

    return {
      date: format(date, "yyyy-MM-dd"),
      status: "present" as const,
      clockInTime: format(clockInTime, "h:mm a"),
      clockOutTime: format(clockOutTime, "h:mm a"),
      workDuration: `${hours}h ${minutes}m`,
      isLate: false,
      lateMinutes: 0,
    };
  }

  // Original October 2025 logic
  // 85% chance of being present
  if (randomValue < 0.85) {
    let clockInHour = 8;
    let clockInMinute = 0;
    let isLate = false;
    let lateMinutes = 0;

    // Check if this is a late date for October 2025
    if (isOctober2025 && lateDates.has(date.getDate())) {
      // Exactly 1 hour late (10:00 AM instead of 9:00 AM)
      clockInHour = 10;
      clockInMinute = 0;
      isLate = true;
      lateMinutes = 60;
    } else {
      // Normal on-time arrival: 8:00-8:45 AM
      clockInHour = 8;
      clockInMinute = Math.floor(randomValue * 45);
    }

    // Clock out time: 5:00-6:00 PM
    const clockOutHour = 17;
    const clockOutMinute = Math.floor(randomValue * 60);

    const clockInTime = new Date(date);
    clockInTime.setHours(clockInHour, clockInMinute, 0);

    const clockOutTime = new Date(date);
    clockOutTime.setHours(clockOutHour, clockOutMinute, 0);

    // Calculate work duration
    const durationMs =
      clockOutTime.getTime() - clockInTime.getTime();
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor(
      (durationMs % (1000 * 60 * 60)) / (1000 * 60),
    );

    return {
      date: format(date, "yyyy-MM-dd"),
      status: "present" as const,
      clockInTime: format(clockInTime, "h:mm a"),
      clockOutTime: format(clockOutTime, "h:mm a"),
      workDuration: `${hours}h ${minutes}m`,
      isLate,
      lateMinutes,
    };
  } else if (randomValue < 0.95) {
    // 10% chance of being absent
    return {
      date: format(date, "yyyy-MM-dd"),
      status: "absent" as const,
      clockInTime: undefined,
      clockOutTime: undefined,
      workDuration: "0h 0m",
      isLate: false,
      lateMinutes: 0,
    };
  } else {
    // 5% chance of being on leave - default to 8 hours work duration
    return {
      date: format(date, "yyyy-MM-dd"),
      status: "on-leave" as const,
      clockInTime: undefined,
      clockOutTime: undefined,
      workDuration: "8h 0m",
      isLate: false,
      lateMinutes: 0,
    };
  }
};

interface AttendanceRecord {
  date: string;
  status: "present" | "absent" | "on-leave";
  clockInTime?: string;
  clockOutTime?: string;
  workDuration: string;
  isLate: boolean;
  lateMinutes: number;
}

interface EmailLog {
  id: string;
  employeeName: string;
  employeeEmail: string;
  dateRange: string;
  includedAttendanceReport: boolean;
  sentDate: string;
  sentBy: string;
}

interface AttendanceSheetGeneratorProps {
  employmentOptions: {
    employmentTypes: string[];
    departments: Array<{ departmentId: number; name: string }>;
    positions: Array<{ positionId: number; departmentId: number; name: string }>;
  };
}

export function AttendanceSheetGenerator({
  employmentOptions,
}: AttendanceSheetGeneratorProps) {
  const employees = useMemo(
    () => syncEmployeesWithEmploymentOptions(getEmployees(), employmentOptions),
    [employmentOptions],
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEmployee, setSelectedEmployee] =
    useState<Employee | null>(null);
  const [dateRange, setDateRange] = useState<{
    from?: Date;
    to?: Date;
  }>({});
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [generatedReport, setGeneratedReport] = useState<
    AttendanceRecord[] | null
  >(null);
  const [logoBase64, setLogoBase64] = useState<string>("");
  const [showEmployeeList, setShowEmployeeList] = useState(false);
  const [employeeListSort, setEmployeeListSort] = useState<"name" | "department">("name");
  
  // Email dialog state
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [includeAttendanceReport, setIncludeAttendanceReport] = useState(false);
  const [emailMessage, setEmailMessage] = useState("");
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);

  useEffect(() => {
    if (!selectedEmployee) {
      return;
    }

    const refreshedEmployee = employees.find(
      (employee) => employee.id === selectedEmployee.id,
    );
    if (refreshedEmployee) {
      setSelectedEmployee(refreshedEmployee);
    }
  }, [employees, selectedEmployee]);

  // Convert logo to base64 for PDF embedding
  useEffect(() => {
    const convertImageToBase64 = async () => {
      try {
        const response = await fetch(logoImage);
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
          setLogoBase64(reader.result as string);
        };
        reader.readAsDataURL(blob);
      } catch (error) {
        console.error("Failed to convert logo to base64:", error);
      }
    };
    convertImageToBase64();
  }, []);

  // Filter employees based on search
  const filteredEmployees = employees.filter((emp) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      emp.firstName.toLowerCase().includes(searchLower) ||
      emp.lastName.toLowerCase().includes(searchLower) ||
      emp.department.toLowerCase().includes(searchLower)
    );
  });

  // Sorted employee list for the view all dialog
  const sortedEmployeeList = [...employees].sort((a, b) => {
    if (employeeListSort === "name") {
      return `${a.lastName}, ${a.firstName}`.localeCompare(`${b.lastName}, ${b.firstName}`);
    } else {
      return a.department.localeCompare(b.department);
    }
  });

  const handleEmployeeSelect = (employeeId: string) => {
    const employee = employees.find(
      (emp) => emp.id === employeeId,
    );
    setSelectedEmployee(employee || null);
    setGeneratedReport(null); // Reset report when changing employee
  };

  const handleGenerateReport = () => {
    // Validation
    if (!selectedEmployee) {
      toast.error("Please select an employee");
      return;
    }

    if (!dateRange.from || !dateRange.to) {
      toast.error("Please select a date range");
      return;
    }

    if (dateRange.from > dateRange.to) {
      toast.error("Start date must be before end date");
      return;
    }

    // Check if date range is too large (more than 90 days)
    const daysDiff = Math.ceil(
      (dateRange.to.getTime() - dateRange.from.getTime()) /
        (1000 * 60 * 60 * 24),
    );

    if (daysDiff > 90) {
      toast.error("Date range cannot exceed 90 days");
      return;
    }

    // Generate attendance records for the date range
    const records: AttendanceRecord[] = [];
    const currentDate = new Date(dateRange.from);

    while (currentDate <= dateRange.to) {
      // Skip weekends
      if (
        currentDate.getDay() !== 0 &&
        currentDate.getDay() !== 6
      ) {
        const record = generateAttendanceData(
          selectedEmployee.id,
          new Date(currentDate),
        );
        records.push(record);
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    setGeneratedReport(records);
    toast.success("Report generated successfully");
  };

  const calculateSummary = () => {
    if (!generatedReport) return null;

    const summary = generatedReport.reduce(
      (acc, record) => {
        if (record.status === "present") {
          acc.presentDays++;
          // Parse work duration
          const match =
            record.workDuration.match(/(\d+)h (\d+)m/);
          if (match) {
            acc.totalWorkHours += parseInt(match[1]);
            acc.totalWorkMinutes += parseInt(match[2]);
          }
          if (record.isLate) {
            acc.lateDays++;
            acc.totalLateMinutes += record.lateMinutes;
          }
        } else if (record.status === "absent") {
          acc.absentDays++;
        } else if (record.status === "on-leave") {
          acc.leaveDays++;
          // Add 8 hours work duration for leave days
          const match =
            record.workDuration.match(/(\d+)h (\d+)m/);
          if (match) {
            acc.totalWorkHours += parseInt(match[1]);
            acc.totalWorkMinutes += parseInt(match[2]);
          }
        }
        return acc;
      },
      {
        presentDays: 0,
        absentDays: 0,
        leaveDays: 0,
        lateDays: 0,
        totalWorkHours: 0,
        totalWorkMinutes: 0,
        totalLateMinutes: 0,
      },
    );

    // Convert minutes to hours
    summary.totalWorkHours += Math.floor(
      summary.totalWorkMinutes / 60,
    );
    summary.totalWorkMinutes = summary.totalWorkMinutes % 60;

    return summary;
  };

  const exportToCSV = () => {
    if (
      !selectedEmployee ||
      !generatedReport ||
      !dateRange.from ||
      !dateRange.to
    ) {
      return;
    }

    const summary = calculateSummary();
    if (!summary) return;

    const headers = [
      "Date",
      "Status",
      "Clock-In",
      "Clock-Out",
      "Work Duration",
      "Late",
    ];
    const rows = generatedReport.map((record) => [
      record.date,
      record.status === "on-leave"
        ? "On Leave"
        : record.status.charAt(0).toUpperCase() +
          record.status.slice(1),
      record.clockInTime || "N/A",
      record.clockOutTime || "N/A",
      record.workDuration,
      record.isLate ? `Yes (${record.lateMinutes} min)` : "No",
    ]);

    const csvContent = [
      `Attendance Report`,
      `Employee: ${selectedEmployee.lastName}, ${selectedEmployee.firstName}`,
      `Department: ${selectedEmployee.department}`,
      `Period: ${format(dateRange.from, "MMM dd, yyyy")} - ${format(dateRange.to, "MMM dd, yyyy")}`,
      ``,
      `Summary:`,
      `Total Days: ${generatedReport.length}`,
      `Present: ${summary.presentDays}`,
      `Absent: ${summary.absentDays}`,
      `On Leave: ${summary.leaveDays}`,
      `Late Arrivals: ${summary.lateDays}`,
      `Total Work Hours: ${summary.totalWorkHours}h ${summary.totalWorkMinutes}m`,
      `Total Late Time: ${Math.floor(summary.totalLateMinutes / 60)}h ${summary.totalLateMinutes % 60}m`,
      ``,
      headers.join(","),
      ...rows.map((row) => row.join(",")),
    ].join("\n");

    // Add UTF-8 BOM to ensure proper encoding
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `attendance-${selectedEmployee.id}-${format(dateRange.from, "yyyyMMdd")}-${format(dateRange.to, "yyyyMMdd")}.csv`,
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success("CSV report exported successfully");
  };

  const exportToPDF = () => {
    if (
      !selectedEmployee ||
      !generatedReport ||
      !dateRange.from ||
      !dateRange.to
    ) {
      return;
    }

    const summary = calculateSummary();
    if (!summary) return;

    const payroll = selectedEmployee.payroll;
    const govIds = payroll?.governmentIds;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Attendance Report</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 30px; }
            .logo-container { text-align: center; margin-bottom: 20px; }
            .logo { width: 120px; height: auto; display: inline-block; }
            .header { margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 15px; }
            h1 { color: #333; margin: 0 0 10px 0; font-size: 28px; }
            .employee-info { color: #666; font-size: 14px; line-height: 1.6; }
            .employee-info table { margin-top: 10px; width: 100%; }
            .employee-info td { padding: 4px 0; border: none; }
            .employee-info .label { font-weight: bold; width: 180px; }
            .summary { margin: 20px 0; padding: 20px; background: #f5f5f5; border-radius: 8px; }
            .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-top: 15px; }
            .summary-item { text-align: center; padding: 10px; background: white; border-radius: 6px; }
            .summary-item .value { font-size: 24px; font-weight: bold; color: #333; }
            .summary-item .label { font-size: 12px; color: #666; margin-top: 5px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 20px; }
            th { background: #333; color: white; padding: 12px 10px; text-align: left; font-size: 11px; }
            td { padding: 10px; border-bottom: 1px solid #ddd; }
            tr:nth-child(even) { background: #f9f9f9; }
            .status-present { color: #22c55e; font-weight: bold; }
            .status-absent { color: #ef4444; font-weight: bold; }
            .status-on-leave { color: #f59e0b; font-weight: bold; }
            .late-badge { background: #fef3c7; color: #f59e0b; padding: 2px 6px; border-radius: 4px; font-size: 10px; }
            .footer { margin-top: 40px; padding-top: 20px; border-top: 2px solid #e2e8f0; color: #64748b; font-size: 11px; text-align: center; line-height: 1.6; }
          </style>
        </head>
        <body>
          <div class="logo-container">
            <img src="${logoBase64 || logoImage}" alt="WFH PULSE Logo" class="logo" />
          </div>
          
          <div class="header">
            <h1>Attendance Report</h1>
            <div class="employee-info">
              <table>
                <tr>
                  <td class="label">Employee:</td>
                  <td>${selectedEmployee.lastName}, ${selectedEmployee.firstName}</td>
                  <td class="label">Employee ID:</td>
                  <td>${selectedEmployee.employeeId}</td>
                </tr>
                <tr>
                  <td class="label">Department:</td>
                  <td>${selectedEmployee.department}</td>
                  <td class="label">Position:</td>
                  <td>${selectedEmployee.position}</td>
                </tr>
                <tr>
                  <td class="label">Period:</td>
                  <td colspan="3">${format(dateRange.from, "MMMM dd, yyyy")} - ${format(dateRange.to, "MMMM dd, yyyy")}</td>
                </tr>
                ${govIds ? `
                <tr>
                  <td class="label">TIN:</td>
                  <td>${govIds.tin}</td>
                  <td class="label">SSS No.:</td>
                  <td>${govIds.sss}</td>
                </tr>
                <tr>
                  <td class="label">PhilHealth No.:</td>
                  <td>${govIds.philHealth}</td>
                  <td class="label">Pag-IBIG No.:</td>
                  <td>${govIds.pagIbig}</td>
                </tr>
                ` : ''}
              </table>
            </div>
          </div>
          
          <div class="summary">
            <h3 style="margin: 0 0 15px 0;">Summary</h3>
            <div class="summary-grid">
              <div class="summary-item">
                <div class="value">${summary.presentDays}</div>
                <div class="label">Days Present</div>
              </div>
              <div class="summary-item">
                <div class="value">${summary.absentDays}</div>
                <div class="label">Days Absent</div>
              </div>
              <div class="summary-item">
                <div class="value">${summary.leaveDays}</div>
                <div class="label">Days On Leave</div>
              </div>
              <div class="summary-item">
                <div class="value">${summary.lateDays}</div>
                <div class="label">Late Arrivals</div>
              </div>
              <div class="summary-item">
                <div class="value">${summary.totalWorkHours}h ${summary.totalWorkMinutes}m</div>
                <div class="label">Total Work Time</div>
              </div>
              <div class="summary-item">
                <div class="value">${Math.floor(summary.totalLateMinutes / 60)}h ${summary.totalLateMinutes % 60}m</div>
                <div class="label">Total Late Time</div>
              </div>
            </div>
          </div>
          
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Day</th>
                <th>Status</th>
                <th>Clock-In</th>
                <th>Clock-Out</th>
                <th>Work Duration</th>
                <th>Late</th>
              </tr>
            </thead>
            <tbody>
              ${generatedReport
                .map((record) => {
                  const date = new Date(record.date);
                  const dayName = format(date, "EEE");
                  return `
                  <tr>
                    <td>${format(date, "MMM dd, yyyy")}</td>
                    <td>${dayName}</td>
                    <td class="status-${record.status}">${record.status === "on-leave" ? "On Leave" : record.status.charAt(0).toUpperCase() + record.status.slice(1)}</td>
                    <td>${record.clockInTime || "N/A"}</td>
                    <td>${record.clockOutTime || "N/A"}</td>
                    <td>${record.workDuration}</td>
                    <td>${record.isLate ? `<span class="late-badge">${record.lateMinutes} min</span>` : "No"}</td>
                  </tr>
                `;
                })
                .join("")}
            </tbody>
          </table>
          
          <div class="footer">
            Generated on ${format(new Date(), "MMMM dd, yyyy 'at' h:mm a")}<br>
            This is an automatically generated report from WFH PULSE.
          </div>
        </body>
      </html>
    `;

    const blob = new Blob([htmlContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const newWindow = window.open(url, "_blank");

    if (newWindow) {
      newWindow.onload = () => {
        setTimeout(() => {
          newWindow.print();
        }, 250);
      };
      toast.success("PDF report opened in new window");
    } else {
      toast.error("Please allow popups to export PDF");
    }
  };

  const calculatePayroll = () => {
    if (
      !selectedEmployee ||
      !generatedReport ||
      !selectedEmployee.payroll
    ) {
      return null;
    }

    const summary = calculateSummary();
    if (!summary) return null;

    const payroll = selectedEmployee.payroll;

    // Calculate total work hours (convert minutes to decimal hours)
    const totalWorkHoursDecimal =
      summary.totalWorkHours + summary.totalWorkMinutes / 60;

    // Calculate hourly rate
    const dailyRate = payroll.salary / 21;
    const hourlyRate = dailyRate / 8;

    // Calculate total work earnings
    const totalWorkEarnings =
      totalWorkHoursDecimal * hourlyRate;

    // Calculate late deduction (convert late minutes to hours)
    const totalLateHoursDecimal = summary.totalLateMinutes / 60;
    const lateDeduction = totalLateHoursDecimal * hourlyRate;

    // Calculate total deductions from payroll
    const payrollDeductions = payroll.deductions.reduce(
      (sum, d) => sum + d.amount,
      0,
    );

    // Calculate net pay
    const grossPay = totalWorkEarnings;
    const totalDeductions = payrollDeductions + lateDeduction;
    const netPay = grossPay - totalDeductions;

    return {
      salary: payroll.salary,
      dailyRate,
      hourlyRate,
      totalWorkHoursDecimal,
      totalWorkEarnings,
      totalLateHoursDecimal,
      lateDeduction,
      payrollDeductions: payroll.deductions,
      totalPayrollDeductions: payrollDeductions,
      grossPay,
      totalDeductions,
      netPay,
    };
  };

  const exportPayslipToCSV = () => {
    if (
      !selectedEmployee ||
      !generatedReport ||
      !dateRange.from ||
      !dateRange.to ||
      !selectedEmployee.payroll
    ) {
      return;
    }

    const summary = calculateSummary();
    const payrollData = calculatePayroll();
    if (!summary || !payrollData) return;

    const formatCSVCurrency = (amount: number) => {
      return `Php ${amount.toFixed(2)}`;
    };

    const csvContent = [
      `PAYSLIP`,
      ``,
      `Employee Information:`,
      `Name,${selectedEmployee.lastName} ${selectedEmployee.firstName}`,
      `Employee ID,${selectedEmployee.employeeId}`,
      `Department,${selectedEmployee.department}`,
      `Position,${selectedEmployee.position}`,
      `Pay Period,${format(dateRange.from, "MMM dd yyyy")} - ${format(dateRange.to, "MMM dd yyyy")}`,
      ``,
      `Salary Information:`,
      `Description,Amount`,
      `Monthly Salary,${formatCSVCurrency(payrollData.salary)}`,
      `Daily Rate,${formatCSVCurrency(payrollData.dailyRate)}`,
      `Hourly Rate,${formatCSVCurrency(payrollData.hourlyRate)}`,
      ``,
      `Work Summary:`,
      `Total Work Hours,${payrollData.totalWorkHoursDecimal.toFixed(2)} hours`,
      `Total Work Earnings,${formatCSVCurrency(payrollData.totalWorkEarnings)}`,
      ``,
      `Deductions:`,
      `Description,Amount`,
      ...payrollData.payrollDeductions.map(
        (d) => `${d.name},${formatCSVCurrency(d.amount)}`,
      ),
      `Late Deduction (${payrollData.totalLateHoursDecimal.toFixed(2)} hours),${formatCSVCurrency(payrollData.lateDeduction)}`,
      ``,
      `Summary:`,
      `Gross Pay,${formatCSVCurrency(payrollData.grossPay)}`,
      `Total Deductions,${formatCSVCurrency(payrollData.totalDeductions)}`,
      `NET PAY (Take Home),${formatCSVCurrency(payrollData.netPay)}`,
    ].join("\n");

    // Add UTF-8 BOM to ensure proper encoding
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `payslip-${selectedEmployee.id}-${format(dateRange.from, "yyyyMMdd")}-${format(dateRange.to, "yyyyMMdd")}.csv`,
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success("Payslip CSV exported successfully");
  };

  const exportPayslipToPDF = () => {
    if (
      !selectedEmployee ||
      !generatedReport ||
      !dateRange.from ||
      !dateRange.to ||
      !selectedEmployee.payroll
    ) {
      return;
    }

    const summary = calculateSummary();
    const payrollData = calculatePayroll();
    if (!summary || !payrollData) return;

    const formatCurrency = (amount: number) => {
      return `Php ${amount.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    };

    const payroll = selectedEmployee.payroll;
    const govIds = payroll?.governmentIds;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Payslip</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              padding: 40px; 
              background: white;
              max-width: 800px;
              margin: 0 auto;
            }
            .logo-container { 
              text-align: center; 
              margin-bottom: 20px; 
            }
            .logo { 
              width: 120px; 
              height: auto;
              display: inline-block;
            }
            .header { 
              text-align: center;
              margin-bottom: 30px; 
              border-bottom: 3px solid #3b82f6; 
              padding-bottom: 20px; 
            }
            h1 { 
              color: #1e293b; 
              margin: 0 0 10px 0; 
              font-size: 32px; 
            }
            .employee-info { 
              background: #f8fafc; 
              padding: 20px; 
              border-radius: 8px; 
              margin-bottom: 25px;
              border: 1px solid #e2e8f0;
            }
            .employee-info table {
              width: 100%;
            }
            .employee-info td {
              padding: 8px 0;
              border: none;
            }
            .employee-info .label {
              color: #64748b;
              font-size: 13px;
              width: 150px;
            }
            .employee-info .value {
              color: #1e293b;
              font-weight: 500;
            }
            .section { 
              margin: 25px 0; 
              padding: 20px; 
              background: #f8fafc; 
              border-radius: 8px;
              border: 1px solid #e2e8f0;
            }
            .section h2 {
              margin: 0 0 15px 0;
              color: #1e293b;
              font-size: 18px;
              display: flex;
              align-items: center;
              gap: 10px;
            }
            .info-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 15px;
            }
            .info-item {
              background: white;
              padding: 12px;
              border-radius: 6px;
            }
            .info-item .label {
              font-size: 12px;
              color: #64748b;
              margin-bottom: 4px;
            }
            .info-item .value {
              font-size: 16px;
              font-weight: bold;
              color: #1e293b;
            }
            table { 
              width: 100%; 
              border-collapse: collapse; 
              font-size: 13px; 
              margin: 15px 0;
              background: white;
            }
            th { 
              background: #1e293b; 
              color: white; 
              padding: 12px; 
              text-align: left; 
              font-size: 12px;
              font-weight: 600;
            }
            td { 
              padding: 12px; 
              border-bottom: 1px solid #e2e8f0; 
            }
            tr:last-child td {
              border-bottom: none;
            }
            .amount {
              text-align: right;
              font-weight: 500;
            }
            .summary-table {
              margin-top: 20px;
            }
            .summary-row {
              background: white !important;
            }
            .summary-row td {
              padding: 10px 12px;
              font-size: 14px;
            }
            .total-row {
              background: #22c55e !important;
              color: white;
            }
            .total-row td {
              padding: 15px 12px;
              font-size: 18px;
              font-weight: bold;
              border: none;
            }
            .footer { 
              margin-top: 40px; 
              padding-top: 20px;
              border-top: 2px solid #e2e8f0;
              color: #64748b; 
              font-size: 11px; 
              text-align: center;
              line-height: 1.6;
            }
            @media print {
              body { padding: 20px; }
            }
          </style>
        </head>
        <body>
          <div class="logo-container">
            <img src="${logoBase64 || logoImage}" alt="WFH PULSE Logo" class="logo" />
          </div>
          
          <div class="header">
            <h1>PAYSLIP</h1>
          </div>
          
          <div class="employee-info">
            <table>
              <tr>
                <td class="label">Employee Name:</td>
                <td class="value">${selectedEmployee.lastName}, ${selectedEmployee.firstName}</td>
                <td class="label">Employee ID:</td>
                <td class="value">${selectedEmployee.employeeId}</td>
              </tr>
              <tr>
                <td class="label">Department:</td>
                <td class="value">${selectedEmployee.department}</td>
                <td class="label">Position:</td>
                <td class="value">${selectedEmployee.position}</td>
              </tr>
              <tr>
                <td class="label">Pay Period:</td>
                <td class="value" colspan="3">${format(dateRange.from, "MMMM dd, yyyy")} - ${format(dateRange.to, "MMMM dd, yyyy")}</td>
              </tr>
              ${govIds ? `
              <tr>
                <td class="label">TIN:</td>
                <td class="value">${govIds.tin}</td>
                <td class="label">SSS No.:</td>
                <td class="value">${govIds.sss}</td>
              </tr>
              <tr>
                <td class="label">PhilHealth No.:</td>
                <td class="value">${govIds.philHealth}</td>
                <td class="label">Pag-IBIG No.:</td>
                <td class="value">${govIds.pagIbig}</td>
              </tr>
              ` : ''}
            </table>
          </div>

          <div class="section">
            <h2>Salary Information</h2>
            <div class="info-grid">
              <div class="info-item">
                <div class="label">Monthly Salary</div>
                <div class="value">${formatCurrency(payrollData.salary)}</div>
              </div>
              <div class="info-item">
                <div class="label">Daily Rate</div>
                <div class="value">${formatCurrency(payrollData.dailyRate)}</div>
              </div>
              <div class="info-item">
                <div class="label">Hourly Rate</div>
                <div class="value">${formatCurrency(payrollData.hourlyRate)}</div>
              </div>
              <div class="info-item">
                <div class="label">Total Work Hours</div>
                <div class="value">${payrollData.totalWorkHoursDecimal.toFixed(2)}h</div>
              </div>
            </div>
          </div>

          <div class="section">
            <h2>Earnings</h2>
            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th style="text-align: right;">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Total Work Earnings (${payrollData.totalWorkHoursDecimal.toFixed(2)}h x ${formatCurrency(payrollData.hourlyRate)})</td>
                  <td class="amount">${formatCurrency(payrollData.totalWorkEarnings)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="section">
            <h2>Deductions</h2>
            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th style="text-align: right;">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${payrollData.payrollDeductions
                  .map(
                    (d) => `
                  <tr>
                    <td>${d.name}</td>
                    <td class="amount">${formatCurrency(d.amount)}</td>
                  </tr>
                `,
                  )
                  .join("")}
                <tr>
                  <td>Late Deduction (${payrollData.totalLateHoursDecimal.toFixed(2)}h x ${formatCurrency(payrollData.hourlyRate)})</td>
                  <td class="amount">${formatCurrency(payrollData.lateDeduction)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <table class="summary-table">
            <tbody>
              <tr class="summary-row">
                <td><strong>Gross Pay</strong></td>
                <td class="amount"><strong>${formatCurrency(payrollData.grossPay)}</strong></td>
              </tr>
              <tr class="summary-row">
                <td><strong>Total Deductions</strong></td>
                <td class="amount"><strong>- ${formatCurrency(payrollData.totalDeductions)}</strong></td>
              </tr>
              <tr class="total-row">
                <td>NET PAY (TAKE HOME)</td>
                <td class="amount">${formatCurrency(payrollData.netPay)}</td>
              </tr>
            </tbody>
          </table>

          <div class="footer">
            Generated on ${format(new Date(), "MMMM dd, yyyy 'at' h:mm a")}<br>
            This is an automatically generated payslip from WFH PULSE.
          </div>
        </body>
      </html>
    `;

    const blob = new Blob([htmlContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const newWindow = window.open(url, "_blank");

    if (newWindow) {
      newWindow.onload = () => {
        setTimeout(() => {
          newWindow.print();
        }, 250);
      };
      toast.success("Payslip PDF opened in new window");
    } else {
      toast.error("Please allow popups to export PDF");
    }
  };

  const getDefaultEmailMessage = () => {
    if (!selectedEmployee || !dateRange.from || !dateRange.to) return "";
    
    const employeeName = `${selectedEmployee.firstName} ${selectedEmployee.lastName}`;
    const periodText = `${format(dateRange.from, "MMMM dd, yyyy")} - ${format(dateRange.to, "MMMM dd, yyyy")}`;
    
    return `Dear ${employeeName},

I hope this email finds you well.

Please find attached your payslip for the period ${periodText}. ${includeAttendanceReport ? 'Your attendance report for this period is also included for your reference.' : ''}

The payslip includes the following:
- Salary breakdown and work hours summary
- All applicable deductions
- Net pay (take-home amount)

Please review the details carefully. If you have any questions or notice any discrepancies, feel free to reach out to the HR department.

Thank you for your continued dedication and hard work.

Best regards,
HR Department
WFH PULSE`;
  };

  const handleOpenEmailDialog = () => {
    if (!selectedEmployee || !dateRange.from || !dateRange.to) {
      toast.error("Please generate a report first");
      return;
    }
    
    setEmailMessage(getDefaultEmailMessage());
    setShowEmailDialog(true);
  };

  const handleSendEmail = () => {
    if (!selectedEmployee || !dateRange.from || !dateRange.to) return;
    
    if (!emailMessage.trim()) {
      toast.error("Please enter an email message");
      return;
    }

    // Create new email log
    const newLog: EmailLog = {
      id: `log-${Date.now()}`,
      employeeName: `${selectedEmployee.lastName}, ${selectedEmployee.firstName}`,
      employeeEmail: selectedEmployee.email || `${selectedEmployee.firstName.toLowerCase()}.${selectedEmployee.lastName.toLowerCase()}@company.com`,
      dateRange: `${format(dateRange.from, "MMM dd, yyyy")} - ${format(dateRange.to, "MMM dd, yyyy")}`,
      includedAttendanceReport: includeAttendanceReport,
      sentDate: format(new Date(), "MMM dd, yyyy 'at' h:mm a"),
      sentBy: "HR Department", // In a real app, this would be the current user
    };

    setEmailLogs([newLog, ...emailLogs]);
    setShowEmailDialog(false);
    setIncludeAttendanceReport(false);
    
    toast.success(`Payslip email sent to ${selectedEmployee.firstName} ${selectedEmployee.lastName}`);
  };

  const summary = calculateSummary();
  const payrollData = selectedEmployee?.payroll
    ? calculatePayroll()
    : null;

  const formatCurrency = (amount: number) => {
    return `Php ${amount.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  return (
    <>
      <div className="space-y-4">
        {/* Employee Search and Selection */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" />
              Select Employee
            </Label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowEmployeeList(!showEmployeeList)}
              className="gap-2 h-8"
            >
              <Users className="h-3.5 w-3.5" />
              {showEmployeeList ? "Hide" : "View All"} Employees
            </Button>
          </div>
        {/* View All Employees Section */}
        {showEmployeeList && (
          <div className="border rounded-lg p-4 bg-muted/20">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium flex items-center gap-2">
                <Users className="h-4 w-4 text-vibrant-purple" />
                All Employees ({employees.length})
              </h4>
              <Select value={employeeListSort} onValueChange={(value: "name" | "department") => setEmployeeListSort(value)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">
                    <div className="flex items-center gap-2">
                      <ArrowUpDown className="h-3 w-3" />
                      Sort by Name
                    </div>
                  </SelectItem>
                  <SelectItem value="department">
                    <div className="flex items-center gap-2">
                      <ArrowUpDown className="h-3 w-3" />
                      Sort by Department
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <ScrollArea className="h-[300px]">
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted/50 sticky top-0 grid grid-cols-2 gap-4 p-3 border-b">
                  <div className="text-sm font-semibold">Name</div>
                  <div className="text-sm font-semibold">Department</div>
                </div>
                <div>
                  {sortedEmployeeList.map((employee, index) => (
                    <button
                      key={employee.id}
                      onClick={() => {
                        handleEmployeeSelect(employee.id);
                        setShowEmployeeList(false);
                        toast.success(`Selected ${employee.firstName} ${employee.lastName}`);
                      }}
                      className={`w-full grid grid-cols-2 gap-4 p-3 text-left border-b last:border-b-0 hover:bg-vibrant-purple/5 active:bg-vibrant-purple/10 transition-colors cursor-pointer ${
                        index % 2 === 0 ? 'bg-background' : 'bg-muted/10'
                      }`}
                    >
                      <div className="font-medium">
                        {employee.lastName}, {employee.firstName}
                      </div>
                      <div className="text-muted-foreground">
                        {employee.department}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </ScrollArea>
          </div>
        )}

          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or department..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {searchQuery && (
              <div className="max-h-48 overflow-y-auto border rounded-lg">
                {filteredEmployees.length > 0 ? (
                  filteredEmployees
                    .slice(0, 10)
                    .map((employee) => (
                      <button
                        key={employee.id}
                        onClick={() => {
                          handleEmployeeSelect(employee.id);
                          setSearchQuery("");
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors border-b last:border-b-0"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-sm">
                              {employee.lastName},{" "}
                              {employee.firstName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {employee.department}
                            </p>
                          </div>
                          <Badge
                            variant="outline"
                            className="text-xs"
                          >
                            {employee.status}
                          </Badge>
                        </div>
                      </button>
                    ))
                ) : (
                  <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                    No employees found
                  </div>
                )}
              </div>
            )}
          </div>

          {selectedEmployee && (
            <div className="mt-3 p-3 bg-muted/30 rounded-lg">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-vibrant-blue" />
                  <div>
                    <p className="font-medium">
                      {selectedEmployee.lastName},{" "}
                      {selectedEmployee.firstName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {selectedEmployee.department} â€¢{" "}
                      {selectedEmployee.position}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedEmployee(null);
                    setGeneratedReport(null);
                  }}
                  className="h-6 px-2 text-xs"
                >
                  Change
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Date Range Selection */}
        <div>
          <Popover
            open={isCalendarOpen}
            onOpenChange={setIsCalendarOpen}
          >
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-start text-left"
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateRange.from && dateRange.to ? (
                  <>
                    {format(dateRange.from, "MMM dd, yyyy")} -{" "}
                    {format(dateRange.to, "MMM dd, yyyy")}
                  </>
                ) : (
                  <span>Pick a date range</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-auto p-0"
              align="start"
            >
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={(range) => {
                  setDateRange(range || {});
                  if (range?.from && range?.to) {
                    setIsCalendarOpen(false);
                  }
                }}
                numberOfMonths={1}
                disabled={(date) => date > new Date()}
              />
              <div className="p-3 border-t">
                <p className="text-xs text-muted-foreground">
                  <AlertCircle className="h-3 w-3 inline mr-1" />
                  Maximum 90 days range allowed
                </p>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Generate Report Button */}
        <Button
          onClick={handleGenerateReport}
          className="w-full"
          disabled={
            !selectedEmployee ||
            !dateRange.from ||
            !dateRange.to
          }
        >
          <FileText className="h-4 w-4 mr-2" />
          Generate Report and Compute Payroll
        </Button>

        {/* Generated Report Display */}
        {generatedReport && summary && (
          <div className="space-y-4 pt-4 border-t">
            {/* Summary Statistics */}
            <div>
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4 text-vibrant-blue" />
                Summary
              </h4>
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center p-2 rounded-lg bg-vibrant-green/10">
                  <p className="text-lg font-bold text-vibrant-green">
                    {summary.presentDays}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Present
                  </p>
                </div>
                <div className="text-center p-2 rounded-lg bg-destructive/10">
                  <p className="text-lg font-bold text-destructive">
                    {summary.absentDays}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Absent
                  </p>
                </div>
                <div className="text-center p-2 rounded-lg bg-vibrant-orange/10">
                  <p className="text-lg font-bold text-vibrant-orange">
                    {summary.lateDays}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Late
                  </p>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="text-center p-2 rounded-lg bg-vibrant-blue/10">
                  <p className="text-sm font-bold text-vibrant-blue">
                    {summary.totalWorkHours}h{" "}
                    {summary.totalWorkMinutes}m
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Total Work Time
                  </p>
                </div>
                <div className="text-center p-2 rounded-lg bg-vibrant-purple/10">
                  <p className="text-sm font-bold text-vibrant-purple">
                    {Math.floor(summary.totalLateMinutes / 60)}h{" "}
                    {summary.totalLateMinutes % 60}m
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Total Late Time
                  </p>
                </div>
              </div>
            </div>

            {/* Export Buttons */}
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={exportToCSV}
                variant="outline"
                className="w-full"
              >
                <Download className="h-4 w-4 mr-2" />
                CSV
              </Button>
              <Button
                onClick={exportToPDF}
                variant="outline"
                className="w-full"
              >
                <Download className="h-4 w-4 mr-2" />
                PDF
              </Button>
            </div>

            {/* Payslip Section */}
            {payrollData && (
              <div className="space-y-3 pt-4 border-t">
                <div className="flex items-start flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <h4 className="font-medium flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-vibrant-green" />
                    Payslip
                  </h4>
                  <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                    <Button
                      onClick={handleOpenEmailDialog}
                      variant="default"
                      size="sm"
                      className="bg-vibrant-blue hover:bg-vibrant-blue/90 flex-1 sm:flex-none"
                    >
                      <Mail className="h-3 w-3 mr-1" />
                      <span className="hidden xs:inline">Send via Email</span>
                      <span className="xs:hidden">Email</span>
                    </Button>
                    <Button
                      onClick={exportPayslipToCSV}
                      variant="outline"
                      size="sm"
                      className="flex-1 sm:flex-none"
                    >
                      <Download className="h-3 w-3 mr-1" />
                      CSV
                    </Button>
                    <Button
                      onClick={exportPayslipToPDF}
                      variant="outline"
                      size="sm"
                      className="flex-1 sm:flex-none"
                    >
                      <Download className="h-3 w-3 mr-1" />
                      PDF
                    </Button>
                  </div>
                </div>

                {/* Salary Information */}
                <div className="p-3 rounded-lg bg-vibrant-blue/10 border border-vibrant-blue/20">
                  <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                    <DollarSign className="h-3 w-3" />
                    Salary Information
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Monthly Salary
                      </p>
                      <p className="font-medium">
                        {formatCurrency(payrollData.salary)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Daily Rate
                      </p>
                      <p className="font-medium">
                        {formatCurrency(payrollData.dailyRate)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Hourly Rate
                      </p>
                      <p className="font-medium">
                        {formatCurrency(payrollData.hourlyRate)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Work Hours
                      </p>
                      <p className="font-medium">
                        {payrollData.totalWorkHoursDecimal.toFixed(
                          2,
                        )}
                        h
                      </p>
                    </div>
                  </div>
                </div>

                {/* Work Earnings */}
                <div className="p-3 rounded-lg bg-vibrant-green/10 border border-vibrant-green/20">
                  <p className="text-xs text-muted-foreground mb-2">
                    Total Work Duration
                  </p>
                  <div className="flex items-baseline justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        {payrollData.totalWorkHoursDecimal.toFixed(
                          2,
                        )}
                        h Ã—{" "}
                        {formatCurrency(payrollData.hourlyRate)}
                      </p>
                    </div>
                    <p className="font-bold text-vibrant-green">
                      {formatCurrency(
                        payrollData.totalWorkEarnings,
                      )}
                    </p>
                  </div>
                </div>

                {/* Deductions */}
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                  <p className="text-xs text-muted-foreground mb-2">
                    Deductions
                  </p>
                  <div className="space-y-1">
                    {payrollData.payrollDeductions.map(
                      (deduction, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="text-muted-foreground">
                            {deduction.name}
                          </span>
                          <span className="text-destructive">
                            - {formatCurrency(deduction.amount)}
                          </span>
                        </div>
                      ),
                    )}
                    <div className="flex items-center justify-between text-sm pt-1 border-t border-destructive/20">
                      <span className="text-muted-foreground">
                        Late Deduction (
                        {payrollData.totalLateHoursDecimal.toFixed(
                          2,
                        )}
                        h)
                      </span>
                      <span className="text-destructive">
                        -{" "}
                        {formatCurrency(
                          payrollData.lateDeduction,
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Net Salary */}
                <div className="p-4 rounded-lg bg-vibrant-purple/10 border-2 border-vibrant-purple">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        Gross Pay
                      </span>
                      <span className="font-medium">
                        {formatCurrency(payrollData.grossPay)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        Total Deductions
                      </span>
                      <span className="text-destructive font-medium">
                        -{" "}
                        {formatCurrency(
                          payrollData.totalDeductions,
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-vibrant-purple/30">
                      <span className="font-medium">
                        NET PAY (Take Home)
                      </span>
                      <span className="font-bold text-vibrant-purple">
                        {formatCurrency(payrollData.netPay)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Attendance Details */}
            <div>
              <h4 className="font-medium mb-2">
                Attendance Details
              </h4>
              <div className="max-h-64 overflow-y-auto border rounded-lg">
                {generatedReport.map((record, index) => {
                  const date = new Date(record.date);
                  return (
                    <div
                      key={index}
                      className="p-3 border-b last:border-b-0 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-1">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-medium">
                              {format(date, "MMM dd, yyyy")}
                            </p>
                            <Badge
                              variant={
                                record.status === "present"
                                  ? "default"
                                  : "outline"
                              }
                              className={`text-xs ${
                                record.status === "present"
                                  ? "bg-vibrant-green text-vibrant-green-foreground"
                                  : record.status === "absent"
                                    ? "bg-destructive text-destructive-foreground"
                                    : "bg-vibrant-orange text-vibrant-orange-foreground"
                              }`}
                            >
                              {record.status === "on-leave"
                                ? "On Leave"
                                : record.status}
                            </Badge>
                            {record.isLate && (
                              <Badge
                                variant="outline"
                                className="text-xs bg-vibrant-orange/10 text-vibrant-orange border-vibrant-orange/30"
                              >
                                Late {record.lateMinutes}m
                              </Badge>
                            )}
                          </div>
                          {record.status === "present" && (
                            <div className="flex gap-4 text-xs text-muted-foreground">
                              <span>
                                In: {record.clockInTime}
                              </span>
                              <span>
                                Out: {record.clockOutTime}
                              </span>
                              <span className="text-vibrant-blue">
                                {record.workDuration}
                              </span>
                            </div>
                          )}
                          {record.status === "on-leave" && (
                            <div className="flex gap-4 text-xs text-muted-foreground">
                              <span className="text-vibrant-orange">
                                Work Duration: {record.workDuration}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Recent Email Logs */}
      {emailLogs.length > 0 && (
      <Card className="mt-4">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-vibrant-blue" />
            Recent Payslip Emails
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {emailLogs.slice(0, 5).map((log) => (
              <div
                key={log.id}
                className="flex items-start justify-between p-3 rounded-lg border bg-muted/20 hover:bg-muted/30 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="h-4 w-4 text-vibrant-green" />
                    <p className="font-medium">{log.employeeName}</p>
                  </div>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <p className="flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {log.employeeEmail}
                    </p>
                    <p className="flex items-center gap-1">
                      <CalendarIcon className="h-3 w-3" />
                      Period: {log.dateRange}
                    </p>
                    {log.includedAttendanceReport && (
                      <p className="text-xs text-vibrant-blue">
                        <FileText className="h-3 w-3 inline mr-1" />
                        Included attendance report
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>Sent: {log.sentDate}</p>
                  <p>By: {log.sentBy}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )}

    {/* Email Dialog */}
    <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-vibrant-blue" />
            Send Payslip via Email
          </DialogTitle>
          <DialogDescription>
            Compose and send the payslip to the employee via email.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Sender and Recipient */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="sender">From (Sender)</Label>
              <Input
                id="sender"
                value="HR Department"
                disabled
                className="bg-muted"
              />
            </div>
            <div>
              <Label htmlFor="recipient">To (Recipient)</Label>
              <Input
                id="recipient"
                value={
                  selectedEmployee
                    ? selectedEmployee.email ||
                      `${selectedEmployee.firstName.toLowerCase()}.${selectedEmployee.lastName.toLowerCase()}@company.com`
                    : ""
                }
                disabled
                className="bg-muted"
              />
            </div>
          </div>

          {/* Email Subject */}
          <div>
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              value={
                dateRange.from && dateRange.to
                  ? `Payslip ${format(dateRange.from, "MMM dd, yyyy")} - ${format(dateRange.to, "MMM dd, yyyy")}`
                  : "Payslip"
              }
              disabled
              className="bg-muted"
            />
          </div>

          {/* Include Attendance Report Toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-vibrant-purple" />
              <div>
                <Label htmlFor="include-attendance" className="cursor-pointer">
                  Include Attendance Report
                </Label>
                <p className="text-xs text-muted-foreground">
                  Attach the attendance report along with the payslip
                </p>
              </div>
            </div>
            <Switch
              id="include-attendance"
              checked={includeAttendanceReport}
              onCheckedChange={(checked) => {
                setIncludeAttendanceReport(checked);
                setEmailMessage(getDefaultEmailMessage());
              }}
            />
          </div>

          {/* Email Message */}
          <div>
            <Label htmlFor="message">Message</Label>
            <Textarea
              id="message"
              value={emailMessage}
              onChange={(e) => setEmailMessage(e.target.value)}
              rows={12}
              className="font-mono text-sm"
              placeholder="Enter your email message here..."
            />
            <p className="text-xs text-muted-foreground mt-1">
              You can edit the message before sending
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setShowEmailDialog(false);
              setIncludeAttendanceReport(false);
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSendEmail}
            className="bg-vibrant-blue hover:bg-vibrant-blue/90"
          >
            <Send className="h-4 w-4 mr-2" />
            Send Email
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
