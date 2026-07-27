import { useState, useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { AttendanceHeader } from "./components/attendance-header";
import { BottomNavigation } from "./components/bottom-navigation";
import { HomePage } from "./components/pages/home-page";
import { DashboardPage } from "./components/pages/dashboard-page";
import { CalendarPage } from "./components/pages/calendar-page";
import { AnalyticsPage } from "./components/pages/analytics-page";
import { SettingsPage } from "./components/pages/settings-page";
import { EmployeeDetailsPage } from "./components/pages/employee-details-page";
import { LoginForm } from "./components/login-form";
import { toast } from "sonner";
import { Toaster } from "./components/ui/sonner";

interface AuthSession {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
}

interface UserProfileState {
  name: string;
  email: string;
  department: string;
  departmentId: number | null;
  phone: string;
  birthday: string;
  gender: string;
  nationality: string;
  maritalStatus: string;
  address: string;
  position: string;
  positionId: number | null;
  employmentType: string;
  joinDate: string;
  sssNumber: string;
  tinNumber: string;
  philhealthNumber: string;
  pagibigNumber: string;
  profilePicture: string | undefined;
}

interface EmploymentDepartmentOption {
  departmentId: number;
  name: string;
}

interface EmploymentPositionOption {
  positionId: number;
  departmentId: number;
  name: string;
}

interface EmploymentOptionsState {
  employmentTypes: string[];
  departments: EmploymentDepartmentOption[];
  positions: EmploymentPositionOption[];
}

interface LoginResponsePayload {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  user?: {
    fullName?: string | null;
    email?: string | null;
    employeeId?: string | null;
  };
}

function resolveApiBaseUrl() {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }

  // Android emulators access host machine services through 10.0.2.2, not localhost.
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
    return "http://10.0.2.2:8787";
  }

  return "http://localhost:8787";
}

export default function App() {
  const apiBaseUrl = resolveApiBaseUrl();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const [currentPage, setCurrentPage] = useState("home");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isClockedIn, setIsClockedIn] = useState(false);
  const [isOnBreak, setIsOnBreak] = useState(false);
  const [clockInTime, setClockInTime] = useState<string>("");
  const [clockInTimestamp, setClockInTimestamp] = useState<Date | undefined>(undefined);

  // Settings state
  const [workingHours, setWorkingHours] = useState({
    start: "09:00",
    end: "18:00",
  });
  const [notifications, setNotifications] = useState({
    clockInReminder: true,
    clockOutReminder: true,
    dailyReport: false,
  });
  const [userProfile, setUserProfile] = useState({
    name: "Alex Ali",
    email: "Alex.Ali@uic.co",
    department: "Engineering",
    departmentId: null,
    phone: "",
    birthday: "",
    gender: "",
    nationality: "",
    maritalStatus: "",
    address: "",
    position: "",
    positionId: null,
    employmentType: "full-time" as const,
    joinDate: "",
    sssNumber: "",
    tinNumber: "",
    philhealthNumber: "",
    pagibigNumber: "",
    profilePicture: undefined,
  });
  const [employmentOptions, setEmploymentOptions] = useState<EmploymentOptionsState>({
    employmentTypes: [
      "full-time",
      "independent contractor",
      "part-time",
      "intern",
      "contract-to-hire",
      "project-based",
      "temporary",
      "consultant",
      "freelance",
      "apprentice",
    ],
    departments: [],
    positions: [],
  });

  const mapApiProfileToState = (
    profile: Record<string, any> | null,
    fallback?: { fullName?: string | null; email?: string | null },
  ): UserProfileState => {
    if (!profile) {
      return {
        name: fallback?.fullName ?? "",
        email: fallback?.email ?? "",
        department: "",
        departmentId: null,
        phone: "",
        birthday: "",
        gender: "",
        nationality: "",
        maritalStatus: "",
        address: "",
        position: "",
        positionId: null,
        employmentType: "full-time",
        joinDate: "",
        sssNumber: "",
        tinNumber: "",
        philhealthNumber: "",
        pagibigNumber: "",
        profilePicture: undefined,
      };
    }

    const firstName = profile.first_name ?? "";
    const lastName = profile.last_name ?? "";
    const fullName = `${firstName} ${lastName}`.trim();
    const parsedDepartmentId =
      profile.department_id == null ? null : Number(profile.department_id);
    const parsedPositionId =
      profile.position_id == null ? null : Number(profile.position_id);

    return {
      name: fullName || "N/A",
      email: profile.email ?? "",
      department: profile.department ?? "",
      departmentId:
        parsedDepartmentId != null && Number.isFinite(parsedDepartmentId)
          ? parsedDepartmentId
          : null,
      phone: profile.phone ?? "",
      birthday: profile.birthday ? String(profile.birthday).slice(0, 10) : "",
      gender: profile.gender ?? "",
      nationality: profile.nationality ?? "",
      maritalStatus: profile.marital_status ?? "",
      address: profile.address ?? "",
      position: profile.position ?? "",
      positionId:
        parsedPositionId != null && Number.isFinite(parsedPositionId)
          ? parsedPositionId
          : null,
      employmentType: profile.employment_type || "full-time",
      joinDate: profile.join_date ? String(profile.join_date).slice(0, 10) : "",
      sssNumber: profile.sss ?? "",
      tinNumber: profile.tin ?? "",
      philhealthNumber: profile.phil_health ?? "",
      pagibigNumber: profile.pag_ibig ?? "",
      profilePicture: profile.profile_picture_url ?? undefined,
    };
  };

  const loadEmploymentOptions = async (accessToken: string) => {
    try {
      const response = await fetch(`${apiBaseUrl}/meta/employment-options`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        return;
      }

      const payload = await response.json();
      setEmploymentOptions({
        employmentTypes: Array.isArray(payload?.employmentTypes)
          ? payload.employmentTypes
          : [],
        departments: Array.isArray(payload?.departments)
          ? payload.departments.map((department: any) => ({
              departmentId: Number(department.department_id),
              name: String(department.name),
            }))
          : [],
        positions: Array.isArray(payload?.positions)
          ? payload.positions.map((position: any) => ({
              positionId: Number(position.position_id),
              departmentId: Number(position.department_id),
              name: String(position.name),
            }))
          : [],
      });
    } catch {
      // Keep fallback options if endpoint is unavailable.
    }
  };

  const loadSelfProfile = async (
    accessToken: string,
    fallback?: { fullName?: string | null; email?: string | null },
  ) => {
    const response = await fetch(`${apiBaseUrl}/me/profile`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      if (response.status === 404 && fallback) {
        setUserProfile(mapApiProfileToState(null, fallback));
        return;
      }

      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.error || "Failed to load profile");
    }

    const payload = await response.json();
    setUserProfile(mapApiProfileToState(payload?.profile ?? null, fallback));
  };

  const updateSelfProfile = async (updates: Record<string, unknown>) => {
    if (!authSession?.accessToken) {
      toast.error("Unable to update profile", {
        description: "Your session is missing. Please sign in again.",
      });
      return false;
    }

    try {
      const response = await fetch(`${apiBaseUrl}/me/profile`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authSession.accessToken}`,
        },
        body: JSON.stringify(updates),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error("Profile update failed", {
          description: payload?.error?.formErrors?.[0] || payload?.error || "Please review your input.",
        });
        return false;
      }

      setUserProfile(mapApiProfileToState(payload?.profile ?? null));
      return true;
    } catch {
      toast.error("Profile update failed", {
        description: "Unable to reach the API server.",
      });
      return false;
    }
  };

  // Mock attendance data for the calendar - October 2025 (Weekdays only, no Saturdays/Sundays)
  const [attendanceData] = useState<
    Record<string, "present" | "absent" | "on-leave" | "late">
  >({
    // October 2025 data - All weekdays from Oct 1 to Oct 31
    "2025-10-01": "present",    // Wednesday
    "2025-10-02": "present",    // Thursday
    "2025-10-03": "late",       // Friday
    "2025-10-06": "present",    // Monday
    "2025-10-07": "present",    // Tuesday
    "2025-10-08": "present",    // Wednesday
    "2025-10-09": "late",       // Thursday
    "2025-10-10": "present",    // Friday
    "2025-10-13": "present",    // Monday
    "2025-10-14": "present",    // Tuesday
    "2025-10-15": "absent",     // Wednesday
    "2025-10-16": "on-leave",   // Thursday
    "2025-10-17": "present",    // Friday
    "2025-10-20": "present",    // Monday
    "2025-10-21": "late",       // Tuesday
    "2025-10-22": "present",    // Wednesday
    "2025-10-23": "present",    // Thursday
    "2025-10-24": "present",    // Friday
    "2025-10-27": "present",    // Monday
    "2025-10-28": "present",    // Tuesday
    "2025-10-29": "late",       // Wednesday
    "2025-10-30": "present",    // Thursday
    "2025-10-31": "present",    // Friday
    
    // September 2025 data - All weekdays from Sept 1 to Sept 30
    "2025-09-01": "present",    // Monday
    "2025-09-02": "present",    // Tuesday
    "2025-09-03": "absent",     // Wednesday
    "2025-09-04": "present",    // Thursday
    "2025-09-05": "present",    // Friday
    "2025-09-08": "present",    // Monday
    "2025-09-09": "present",    // Tuesday
    "2025-09-10": "late",       // Wednesday
    "2025-09-11": "present",    // Thursday
    "2025-09-12": "present",    // Friday
    "2025-09-15": "absent",     // Monday
    "2025-09-16": "present",    // Tuesday
    "2025-09-17": "present",    // Wednesday
    "2025-09-18": "present",    // Thursday
    "2025-09-19": "late",       // Friday
    "2025-09-22": "present",    // Monday
    "2025-09-23": "present",    // Tuesday
    "2025-09-24": "absent",     // Wednesday
    "2025-09-25": "present",    // Thursday
    "2025-09-26": "late",       // Friday
    "2025-09-29": "present",    // Monday
    "2025-09-30": "present",    // Tuesday
    
    // November 2025 data - Weekdays only (partial month for upcoming)
    "2025-11-03": "present",    // Monday
    "2025-11-04": "present",    // Tuesday
    "2025-11-05": "present",    // Wednesday
    "2025-11-06": "late",       // Thursday
    "2025-11-07": "present",    // Friday
    "2025-11-10": "present",    // Monday
    "2025-11-12": "present",    // Wednesday
    "2025-11-13": "present",    // Thursday
    "2025-11-14": "present",    // Friday
    "2025-11-17": "present",    // Monday
    "2025-11-18": "present",    // Tuesday
    "2025-11-19": "late",       // Wednesday
    "2025-11-20": "present",    // Thursday
    "2025-11-21": "present",    // Friday
    "2025-11-24": "present",    // Monday
    "2025-11-25": "present",    // Tuesday
    "2025-11-26": "on-leave",   // Wednesday
    
    // August 2025 data - Week 4-5 (partial month)
    "2025-08-18": "present",    // Monday
    "2025-08-19": "present",    // Tuesday
    "2025-08-20": "late",       // Wednesday
    "2025-08-21": "present",    // Thursday
    "2025-08-22": "present",    // Friday
    "2025-08-25": "present",    // Monday
    "2025-08-26": "present",    // Tuesday
    "2025-08-27": "present",    // Wednesday
    "2025-08-28": "absent",     // Thursday
    "2025-08-29": "present",    // Friday

    // June 2026 - June 1=Mon, June 12=Philippine Independence Day (holiday)
    "2026-06-01": "present",    // Monday
    "2026-06-02": "present",    // Tuesday
    "2026-06-03": "present",    // Wednesday
    "2026-06-04": "present",    // Thursday
    "2026-06-05": "late",       // Friday
    "2026-06-08": "present",    // Monday
    "2026-06-09": "present",    // Tuesday
    "2026-06-10": "present",    // Wednesday
    "2026-06-11": "absent",     // Thursday
    "2026-06-12": "holiday",    // Friday - Philippine Independence Day
    "2026-06-15": "on-leave",   // Monday
    "2026-06-16": "present",    // Tuesday
    "2026-06-17": "present",    // Wednesday
    "2026-06-18": "present",    // Thursday
    "2026-06-19": "late",       // Friday
    "2026-06-22": "present",    // Monday
    "2026-06-23": "present",    // Tuesday
    "2026-06-24": "present",    // Wednesday
    "2026-06-25": "present",    // Thursday
    "2026-06-26": "present",    // Friday
    "2026-06-29": "present",    // Monday
    "2026-06-30": "present",    // Tuesday

    // July 2026 (up to Jul 21) - July 1=Wed, July 4=Sat (Independence Day USA)
    "2026-07-01": "present",    // Wednesday
    "2026-07-02": "present",    // Thursday
    "2026-07-03": "present",    // Friday
    // July 4 = Saturday (Independence Day USA - weekend)
    "2026-07-06": "present",    // Monday
    "2026-07-07": "late",       // Tuesday
    "2026-07-08": "present",    // Wednesday
    "2026-07-09": "present",    // Thursday
    "2026-07-10": "present",    // Friday
    "2026-07-13": "present",    // Monday
    "2026-07-14": "on-leave",   // Tuesday
    "2026-07-15": "absent",     // Wednesday
    "2026-07-16": "present",    // Thursday
    "2026-07-17": "present",    // Friday
    "2026-07-20": "late",       // Monday
    "2026-07-21": "present",    // Tuesday (today)
  });

  // Mock holidays data - USA & Philippines (Current date: Jul 21, 2026)
  // Only upcoming holidays shown (past holidays filtered out)
  const [holidays, setHolidays] = useState([
    {
      id: "h1",
      name: "Ninoy Aquino Day (Philippines)",
      date: "2026-08-21",
      type: "public" as const,
      daysUntil: 31,
    },
    {
      id: "h2",
      name: "National Heroes Day (Philippines)",
      date: "2026-08-31",
      type: "public" as const,
      daysUntil: 41,
    },
    {
      id: "h3",
      name: "Labor Day (USA)",
      date: "2026-09-07",
      type: "public" as const,
      daysUntil: 48,
    },
    {
      id: "h4",
      name: "Columbus Day (USA)",
      date: "2026-10-12",
      type: "public" as const,
      daysUntil: 83,
    },
    {
      id: "h5",
      name: "All Saints' Day (Philippines)",
      date: "2026-11-01",
      type: "public" as const,
      daysUntil: 103,
    },
    {
      id: "h6",
      name: "Veterans Day (USA)",
      date: "2026-11-11",
      type: "public" as const,
      daysUntil: 113,
    },
    {
      id: "h7",
      name: "Thanksgiving Day (USA)",
      date: "2026-11-26",
      type: "public" as const,
      daysUntil: 128,
    },
    {
      id: "h8",
      name: "Bonifacio Day (Philippines)",
      date: "2026-11-30",
      type: "public" as const,
      daysUntil: 132,
    },
    {
      id: "h9",
      name: "Feast of the Immaculate Conception (Philippines)",
      date: "2026-12-08",
      type: "public" as const,
      daysUntil: 140,
    },
    {
      id: "h10",
      name: "Christmas Eve",
      date: "2026-12-24",
      type: "public" as const,
      daysUntil: 156,
    },
    {
      id: "h11",
      name: "Christmas Day",
      date: "2026-12-25",
      type: "public" as const,
      daysUntil: 157,
    },
    {
      id: "h12",
      name: "Rizal Day (Philippines)",
      date: "2026-12-30",
      type: "public" as const,
      daysUntil: 162,
    },
    {
      id: "h13",
      name: "New Year's Eve",
      date: "2026-12-31",
      type: "public" as const,
      daysUntil: 163,
    },
    {
      id: "h14",
      name: "New Year's Day",
      date: "2027-01-01",
      type: "public" as const,
      daysUntil: 164,
    },
  ]);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.classList.toggle(
      "dark",
      isDarkMode,
    );
  }, [isDarkMode]);

  const handleToggleTheme = () => {
    setIsDarkMode(!isDarkMode);
    if (isLoggedIn) {
      toast.success(
        `Switched to ${!isDarkMode ? "dark" : "light"} mode`,
      );
    }
  };

  const handleLogin = async (email: string, password: string) => {
    try {
      const response = await fetch(`${apiBaseUrl}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      let payload: ({ error?: string } & Partial<LoginResponsePayload>) | null = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok) {
        toast.error("Sign in failed", {
          description: payload?.error || "User does not exist or password is incorrect",
        });
        return;
      }

      if (!payload?.accessToken || !payload?.refreshToken || !payload?.sessionId) {
        toast.error("Sign in failed", {
          description: "API login response is missing session information.",
        });
        return;
      }

      setAuthSession({
        accessToken: payload.accessToken,
        refreshToken: payload.refreshToken,
        sessionId: payload.sessionId,
      });

      setUserProfile((prev) => ({
        ...prev,
        name: payload.user?.fullName || prev.name,
        email: payload.user?.email || prev.email,
      }));

      await loadSelfProfile(payload.accessToken, {
        fullName: payload.user?.fullName,
        email: payload.user?.email,
      });
      await loadEmploymentOptions(payload.accessToken);

      setIsLoggedIn(true);
      toast.success("Welcome back!", {
        description: "Successfully signed in to your account",
      });
    } catch {
      toast.error("Sign in failed", {
        description: "Unable to reach auth server. Please check your API connection.",
      });
    }
  };

  const handleLogout = () => {
    setAuthSession(null);
    setIsLoggedIn(false);
    setIsClockedIn(false);
    setIsOnBreak(false);
    setClockInTime("");
    setClockInTimestamp(undefined);
    setCurrentPage("home");
    toast.success("Logged out successfully", {
      description: "See you next time!",
    });
  };

  const handleClockIn = () => {
    const now = new Date();
    const timeString = now.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    setIsClockedIn(true);
    setClockInTime(timeString);
    setClockInTimestamp(now);
    toast.success(`Successfully clocked in at ${timeString}`, {
      description: "Have a productive day!",
    });
  };

  const handleClockOut = () => {
    const now = new Date();
    const timeString = now.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    setIsClockedIn(false);
    setIsOnBreak(false);
    setClockInTime("");
    setClockInTimestamp(undefined);
    toast.success(`Successfully clocked out at ${timeString}`, {
      description: "Great work today!",
    });
  };

  const handleBreak = () => {
    if (isOnBreak) {
      setIsOnBreak(false);
      toast.success("Break ended", {
        description: "Welcome back! Ready to continue?",
      });
    } else {
      setIsOnBreak(true);
      toast.success("Break started", {
        description: "Take your time and recharge!",
      });
    }
  };

  const handleAddHoliday = (
    holiday: Omit<(typeof holidays)[0], "id" | "daysUntil">,
  ) => {
    const today = new Date();
    const holidayDate = new Date(holiday.date);
    const daysUntil = Math.ceil(
      (holidayDate.getTime() - today.getTime()) /
        (1000 * 60 * 60 * 24),
    );

    const newHoliday = {
      ...holiday,
      id: Date.now().toString(),
      daysUntil,
    };

    setHolidays((prev) => [...prev, newHoliday]);
  };

  const handleEditHoliday = (
    id: string,
    holiday: Omit<(typeof holidays)[0], "id" | "daysUntil">,
  ) => {
    const today = new Date();
    const holidayDate = new Date(holiday.date);
    const daysUntil = Math.ceil(
      (holidayDate.getTime() - today.getTime()) /
        (1000 * 60 * 60 * 24),
    );

    setHolidays((prev) =>
      prev.map((h) =>
        h.id === id ? { ...holiday, id, daysUntil } : h,
      ),
    );
  };

  const handleDeleteHoliday = (id: string) => {
    setHolidays((prev) => prev.filter((h) => h.id !== id));
  };

  const formatWorkingHours = () => {
    const startTime = new Date(
      `1970-01-01T${workingHours.start}:00`,
    );
    const endTime = new Date(
      `1970-01-01T${workingHours.end}:00`,
    );

    const formatTime = (date: Date) =>
      date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });

    return `${formatTime(startTime)} - ${formatTime(endTime)}`;
  };

  const handleEmployeeClick = (employeeId: string) => {
    setSelectedEmployeeId(employeeId);
    setCurrentPage("employee-details");
  };

  const handleBackFromEmployeeDetails = () => {
    setSelectedEmployeeId(null);
    setCurrentPage("home");
  };

  const renderCurrentPage = () => {
    switch (currentPage) {
      case "home":
        return (
          <HomePage
            isClockedIn={isClockedIn}
            isOnBreak={isOnBreak}
            clockInTime={clockInTime}
            clockInTimestamp={clockInTimestamp}
            onClockIn={handleClockIn}
            onClockOut={handleClockOut}
            onBreak={handleBreak}
            attendanceData={attendanceData}
            holidays={holidays}
            workingHours={formatWorkingHours()}
            scheduledStartTime={workingHours.start}
            location="Tech Hub Office, Floor 5"
            onEmployeeClick={handleEmployeeClick}
          />
        );
      case "dashboard":
        return <DashboardPage />;
      case "calendar":
        return (
          <CalendarPage
            attendanceData={attendanceData}
            holidays={holidays}
            onAddHoliday={handleAddHoliday}
            onEditHoliday={handleEditHoliday}
            onDeleteHoliday={handleDeleteHoliday}
          />
        );
      case "analytics":
        return (
          <AnalyticsPage attendanceData={attendanceData} />
        );
      case "settings":
        return (
          <SettingsPage
            workingHours={workingHours}
            onUpdateWorkingHours={setWorkingHours}
            notifications={notifications}
            onUpdateNotifications={setNotifications}
            userProfile={userProfile}
            employmentOptions={employmentOptions}
            onUpdateProfile={updateSelfProfile}
          />
        );
      case "employee-details":
        return selectedEmployeeId ? (
          <EmployeeDetailsPage
            employeeId={selectedEmployeeId}
            onBack={handleBackFromEmployeeDetails}
          />
        ) : null;
      default:
        return null;
    }
  };

  // Show login form if not logged in
  if (!isLoggedIn) {
    return (
      <>
        <LoginForm
          onLogin={handleLogin}
          isDarkMode={isDarkMode}
          onToggleTheme={handleToggleTheme}
        />
        <Toaster richColors position="top-center" closeButton />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-md mx-auto bg-background shadow-2xl min-h-screen relative">
        <AttendanceHeader
          isDarkMode={isDarkMode}
          onToggleTheme={handleToggleTheme}
          onLogout={handleLogout}
        />

        <div className="pt-6">{renderCurrentPage()}</div>

        <BottomNavigation
          currentPage={currentPage}
          onPageChange={setCurrentPage}
        />
      </div>

      <Toaster richColors position="top-center" closeButton />
    </div>
  );
}
