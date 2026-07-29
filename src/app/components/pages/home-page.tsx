import { useEffect, useMemo, useState } from "react";
import { AttendanceStatus } from "../attendance-status";
import { AttendanceActions } from "../attendance-actions";
import { MiniCalendar } from "../mini-calendar";
import { UpcomingHolidays } from "../upcoming-holidays";
import { EmployeesCard } from "../employees-card";
import { AttendanceDetailsModal } from "../attendance-details-modal";
import { AttendanceAdjustmentModal } from "../attendance-adjustment-modal";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { TrendingUp, ChevronDown, Calendar as CalendarIcon, Users } from "lucide-react";
import { Button } from "../ui/button";
import { motion, AnimatePresence } from "motion/react";
import {
  AttendanceDetails,
  AttendanceAdjustmentRequest,
} from "../attendance-details-data";

interface HomePageProps {
  isClockedIn: boolean;
  isOnBreak: boolean;
  clockInTime: string;
  clockInTimestamp?: Date;
  onClockIn: () => void;
  onClockOut: () => void;
  onBreak: () => void;
  attendanceData: Record<
    string,
    "present" | "absent" | "holiday" | "late" | "on-leave"
  >;
  calendarAttendanceDetails: Record<
    string,
    {
      date: string;
      status: "present" | "absent" | "holiday" | "late" | "on-leave";
      clockIn: string | null;
      clockOut: string | null;
      workDurationMinutes: number | null;
      lateMinutes: number | null;
    }
  >;
  holidays: any[];
  workingHours: string;
  scheduledStartTime: string;
  location: string;
  apiBaseUrl: string;
  accessToken: string;
  employmentOptions: {
    employmentTypes: string[];
    departments: Array<{ departmentId: number; name: string }>;
    positions: Array<{ positionId: number; departmentId: number; name: string }>;
  };
  onEmployeeClick: (employeeId: string) => void;
  onCalendarRefresh?: () => Promise<void>;
}

export function HomePage({
  isClockedIn,
  isOnBreak,
  clockInTime,
  clockInTimestamp,
  onClockIn,
  onClockOut,
  onBreak,
  attendanceData,
  calendarAttendanceDetails,
  holidays,
  workingHours,
  scheduledStartTime,
  apiBaseUrl,
  accessToken,
  employmentOptions,
  onEmployeeClick,
  onCalendarRefresh,
}: HomePageProps) {
  type AdjustmentStatus = "pending" | "approved" | "denied" | "cancelled";
  interface AdjustmentLogItem {
    status: AdjustmentStatus;
    date: Date;
    approvedBy?: string;
    reason?: string;
  }

  interface AdjustmentRequestState extends AttendanceAdjustmentRequest {
    status: AdjustmentStatus;
    logTrail: AdjustmentLogItem[];
  }

  // Card visibility states - hidden by default
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isEmployeesOpen, setIsEmployeesOpen] = useState(false);
  const [isHolidaysOpen, setIsHolidaysOpen] = useState(false);

  // Attendance details and adjustment state
  const [adjustmentRequests, setAdjustmentRequests] = useState<AdjustmentRequestState[]>([]);
  const [isLoadingAdjustmentRequests, setIsLoadingAdjustmentRequests] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [editingRequest, setEditingRequest] = useState<AdjustmentRequestState | null>(null);
  const [prefilledTimes, setPrefilledTimes] = useState<{ clockIn: string; clockOut: string } | null>(null);

  const attendanceDetailsData = useMemo<Record<string, AttendanceDetails>>(() => {
    const detailsMap: Record<string, AttendanceDetails> = {};
    for (const [dateKey, status] of Object.entries(attendanceData)) {
      const source = calendarAttendanceDetails[dateKey];
      const workDuration =
        source?.workDurationMinutes != null
          ? `${Math.floor(source.workDurationMinutes / 60)}h ${source.workDurationMinutes % 60}m`
          : undefined;

      detailsMap[dateKey] = {
        date: dateKey,
        status,
        clockInTime: source?.clockIn ?? undefined,
        clockOutTime: source?.clockOut ?? undefined,
        workDuration,
        lateMinutes: source?.lateMinutes ?? undefined,
      };
    }

    return detailsMap;
  }, [attendanceData, calendarAttendanceDetails]);

  const mapApiAdjustmentRequest = (row: any): AdjustmentRequestState | null => {
    if (!row?.requestId || !row?.requestDate) {
      return null;
    }

    const logs: AdjustmentLogItem[] = Array.isArray(row.logs)
      ? row.logs
          .map((entry: any) => {
            if (!entry?.loggedAt || !entry?.status) {
              return null;
            }
            const status = String(entry.status) as AdjustmentStatus;
            if (!["pending", "approved", "denied", "cancelled"].includes(status)) {
              return null;
            }
            const loggedDate = new Date(String(entry.loggedAt));
            if (Number.isNaN(loggedDate.getTime())) {
              return null;
            }
            return {
              status,
              date: loggedDate,
              approvedBy: entry.approvedBy ? String(entry.approvedBy) : undefined,
              reason: entry.reason ? String(entry.reason) : undefined,
            };
          })
          .filter(Boolean)
      : [];

    const submittedDate = row.submittedAt
      ? new Date(String(row.submittedAt)).toLocaleString()
      : new Date().toLocaleString();

    const breakDuration = Number(row.breakDurationMinutes ?? 0);
    const totalMinutes = Number(row.totalWorkDurationMinutes ?? 0);
    const totalWorkDuration = `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;

    return {
      id: String(row.requestId),
      date: String(row.requestDate).slice(0, 10),
      reason: row.reason,
      shiftDateFrom: String(row.shiftDateFrom).slice(0, 10),
      shiftDateTo: String(row.shiftDateTo).slice(0, 10),
      clockInTime: String(row.clockInTime ?? ""),
      clockOutTime: String(row.clockOutTime ?? ""),
      breakDuration,
      totalWorkDuration,
      message: String(row.message ?? ""),
      attachments: Array.isArray(row.attachments)
        ? row.attachments.map((attachment: any) => String(attachment.fileName ?? "")).filter(Boolean)
        : [],
      status: String(row.status) as AdjustmentStatus,
      submittedDate,
      approvedBy: row.approvedBy ? String(row.approvedBy) : undefined,
      approvedDate: row.approvedAt
        ? new Date(String(row.approvedAt)).toLocaleString()
        : undefined,
      deniedReason: row.deniedReason ? String(row.deniedReason) : undefined,
      logTrail: logs,
    };
  };

  const loadAdjustmentRequests = async () => {
    if (!accessToken) {
      return;
    }

    setIsLoadingAdjustmentRequests(true);
    try {
      const response = await fetch(`${apiBaseUrl}/me/attendance-adjustments`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        return;
      }

      const payload = await response.json().catch(() => ({}));
      const rows = Array.isArray(payload?.requests) ? payload.requests : [];
      const mapped = rows.map(mapApiAdjustmentRequest).filter(Boolean) as AdjustmentRequestState[];
      setAdjustmentRequests(mapped);
    } catch {
      // Keep current request state if API is temporarily unreachable.
    } finally {
      setIsLoadingAdjustmentRequests(false);
    }
  };

  const upsertAdjustmentRequest = (request: AdjustmentRequestState) => {
    setAdjustmentRequests((prev) => {
      const next = prev.filter((item) => item.id !== request.id && item.date !== request.date);
      return [request, ...next];
    });
  };

  const removeAdjustmentRequest = (requestId: string) => {
    setAdjustmentRequests((prev) => prev.filter((item) => item.id !== requestId));
  };

  useEffect(() => {
    void loadAdjustmentRequests();
  }, [accessToken, apiBaseUrl]);

  // Handle date click from mini calendar
  const handleDateClick = (date: string) => {
    setSelectedDate(date);
    setShowDetailsModal(true);
  };

  // Handle request adjustment from details modal
  const handleRequestAdjustment = (date: string) => {
    setSelectedDate(date);
    const existingRequest = adjustmentRequests.find((req) => req.date === date) ?? null;
    setEditingRequest(existingRequest);

    // Prefill times from attendance details if available
    const details = attendanceDetailsData[date];
    if (details && (details.status === "present" || details.status === "late")) {
      setPrefilledTimes({
        clockIn: details.clockInTime || "",
        clockOut: details.clockOutTime || ""
      });
    } else {
      setPrefilledTimes({
        clockIn: "09:00",
        clockOut: "18:00",
      });
    }

    setShowAdjustmentModal(true);
  };

  // Handle submit adjustment request
  const handleSubmitAdjustment = async (
    request: Omit<AttendanceAdjustmentRequest, "id" | "submittedDate">,
  ) => {
    if (!accessToken) {
      toast.error("Your session has expired. Please sign in again.");
      return false;
    }

    const endpoint = editingRequest
      ? `${apiBaseUrl}/me/attendance-adjustments/${editingRequest.id}`
      : `${apiBaseUrl}/me/attendance-adjustments`;
    const method = editingRequest ? "PUT" : "POST";

    try {
      const response = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(request),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(payload?.error || "Unable to save adjustment request");
        return false;
      }

      const savedRequest = mapApiAdjustmentRequest(payload?.request);
      if (savedRequest) {
        upsertAdjustmentRequest(savedRequest);
        setEditingRequest(savedRequest);
      } else {
        await loadAdjustmentRequests();
      }

      if (onCalendarRefresh) {
        await onCalendarRefresh();
      }
      return true;
    } catch {
      toast.error("Unable to reach API for adjustment request");
      return false;
    }
  };

  // Handle delete adjustment request
  const handleDeleteAdjustment = async (requestId: string) => {
    if (!accessToken) {
      toast.error("Your session has expired. Please sign in again.");
      return false;
    }

    try {
      const response = await fetch(`${apiBaseUrl}/me/attendance-adjustments/${requestId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(payload?.error || "Unable to delete adjustment request");
        return false;
      }

      removeAdjustmentRequest(requestId);
      setEditingRequest(null);
      if (onCalendarRefresh) {
        await onCalendarRefresh();
      }
      return true;
    } catch {
      toast.error("Unable to reach API for deletion");
      return false;
    }
  };

  const handleRevokeAdjustment = async (requestId: string) => {
    if (!accessToken) {
      toast.error("Your session has expired. Please sign in again.");
      return false;
    }

    try {
      const response = await fetch(`${apiBaseUrl}/me/attendance-adjustments/${requestId}/revoke`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(payload?.error || "Unable to revoke adjustment request");
        return false;
      }

      const revokedRequest = mapApiAdjustmentRequest(payload?.request);
      if (revokedRequest) {
        upsertAdjustmentRequest(revokedRequest);
        setEditingRequest(revokedRequest);
      } else {
        await loadAdjustmentRequests();
      }

      if (onCalendarRefresh) {
        await onCalendarRefresh();
      }
      return true;
    } catch {
      toast.error("Unable to reach API for revoke");
      return false;
    }
  };

  // Calculate monthly stats
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const daysInMonth = new Date(
    currentYear,
    currentMonth + 1,
    0,
  ).getDate();

  const monthlyStats = Object.entries(attendanceData).reduce(
    (stats, [date, status]) => {
      const entryDate = new Date(date);
      if (
        entryDate.getMonth() === currentMonth &&
        entryDate.getFullYear() === currentYear
      ) {
        if (status === "present" || status === "late")
          stats.present++;
        if (status === "absent") stats.absent++;
        if (status === "late") stats.late++;
      }
      return stats;
    },
    { present: 0, absent: 0, late: 0 },
  );

  const attendancePercentage = Math.round(
    (monthlyStats.present / daysInMonth) * 100,
  );

  return (
    <div className="space-y-6 pb-20">
      <AttendanceStatus
        isClockedIn={isClockedIn}
        isOnBreak={isOnBreak}
        clockInTime={clockInTime}
        workingHours={workingHours}
        clockInTimestamp={clockInTimestamp}
        scheduledStartTime={scheduledStartTime}
      />

      <AttendanceActions
        isClockedIn={isClockedIn}
        onClockIn={onClockIn}
        onClockOut={onClockOut}
        onBreak={onBreak}
        isOnBreak={isOnBreak}
      />

      <div className="px-4 space-y-4">
        {/* Monthly Summary Stats */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-vibrant-blue" />
              Monthly Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="text-center p-3 rounded-lg bg-vibrant-green/10">
              <p className="text-2xl font-bold text-vibrant-green">
                {monthlyStats.present}
              </p>
              <p className="text-sm text-muted-foreground">
                Days Present
              </p>
            </div>
            <div className="text-center p-3 rounded-lg bg-vibrant-blue/10">
              <p className="text-2xl font-bold text-vibrant-blue">
                {attendancePercentage}%
              </p>
              <p className="text-sm text-muted-foreground">
                Attendance Rate
              </p>
            </div>
            <div className="text-center p-3 rounded-lg bg-vibrant-orange/10">
              <p className="text-2xl font-bold text-vibrant-orange">
                {monthlyStats.late}
              </p>
              <p className="text-sm text-muted-foreground">
                Late Arrivals
              </p>
            </div>
            <div className="text-center p-3 rounded-lg bg-destructive/10">
              <p className="text-2xl font-bold text-destructive">
                {monthlyStats.absent}
              </p>
              <p className="text-sm text-muted-foreground">
                Absences
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Mini Calendar with Animated Toggle */}
        <Card>
          <CardHeader 
            className="pb-3 cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={() => setIsCalendarOpen(!isCalendarOpen)}
          >
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <CalendarIcon className="h-5 w-5 text-vibrant-blue" />
                Calendar
              </CardTitle>
              <motion.div
                animate={{ rotate: isCalendarOpen ? 180 : 0 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsCalendarOpen(!isCalendarOpen);
                  }}
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </motion.div>
            </div>
          </CardHeader>
          <AnimatePresence initial={false}>
            {isCalendarOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ 
                  height: "auto", 
                  opacity: 1,
                  transition: {
                    height: {
                      duration: 0.4,
                      ease: [0.4, 0, 0.2, 1]
                    },
                    opacity: {
                      duration: 0.3,
                      delay: 0.1,
                      ease: "easeOut"
                    }
                  }
                }}
                exit={{ 
                  height: 0, 
                  opacity: 0,
                  transition: {
                    height: {
                      duration: 0.3,
                      ease: [0.4, 0, 0.2, 1]
                    },
                    opacity: {
                      duration: 0.2,
                      ease: "easeIn"
                    }
                  }
                }}
                style={{ overflow: "hidden" }}
              >
                <CardContent className="pt-0">
                  <motion.div
                    initial={{ y: -10 }}
                    animate={{ 
                      y: 0,
                      transition: {
                        duration: 0.3,
                        delay: 0.1,
                        ease: "easeOut"
                      }
                    }}
                    exit={{ y: -10 }}
                  >
                    <MiniCalendar attendanceData={attendanceData} onDateClick={handleDateClick} />
                  </motion.div>
                </CardContent>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>

        {/* Employees Card with Animated Toggle */}
        <Card>
          <CardHeader 
            className="pb-3 cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={() => setIsEmployeesOpen(!isEmployeesOpen)}
          >
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-vibrant-purple" />
                Team Members
              </CardTitle>
              <motion.div
                animate={{ rotate: isEmployeesOpen ? 180 : 0 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsEmployeesOpen(!isEmployeesOpen);
                  }}
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </motion.div>
            </div>
          </CardHeader>
          <AnimatePresence initial={false}>
            {isEmployeesOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ 
                  height: "auto", 
                  opacity: 1,
                  transition: {
                    height: {
                      duration: 0.4,
                      ease: [0.4, 0, 0.2, 1]
                    },
                    opacity: {
                      duration: 0.3,
                      delay: 0.1,
                      ease: "easeOut"
                    }
                  }
                }}
                exit={{ 
                  height: 0, 
                  opacity: 0,
                  transition: {
                    height: {
                      duration: 0.3,
                      ease: [0.4, 0, 0.2, 1]
                    },
                    opacity: {
                      duration: 0.2,
                      ease: "easeIn"
                    }
                  }
                }}
                style={{ overflow: "hidden" }}
              >
                <CardContent className="pt-0">
                  <motion.div
                    initial={{ y: -10 }}
                    animate={{ 
                      y: 0,
                      transition: {
                        duration: 0.3,
                        delay: 0.1,
                        ease: "easeOut"
                      }
                    }}
                    exit={{ y: -10 }}
                  >
                    <EmployeesCard
                      onEmployeeClick={onEmployeeClick}
                      apiBaseUrl={apiBaseUrl}
                      accessToken={accessToken}
                      employmentOptions={employmentOptions}
                    />
                  </motion.div>
                </CardContent>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>

        {/* Upcoming Holidays with Animated Toggle */}
        <Card>
          <CardHeader 
            className="pb-3 cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={() => setIsHolidaysOpen(!isHolidaysOpen)}
          >
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <CalendarIcon className="h-5 w-5 text-vibrant-purple" />
                Upcoming Holidays & Celebrations
              </CardTitle>
              <motion.div
                animate={{ rotate: isHolidaysOpen ? 180 : 0 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsHolidaysOpen(!isHolidaysOpen);
                  }}
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </motion.div>
            </div>
          </CardHeader>
          <AnimatePresence initial={false}>
            {isHolidaysOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ 
                  height: "auto", 
                  opacity: 1,
                  transition: {
                    height: {
                      duration: 0.4,
                      ease: [0.4, 0, 0.2, 1]
                    },
                    opacity: {
                      duration: 0.3,
                      delay: 0.1,
                      ease: "easeOut"
                    }
                  }
                }}
                exit={{ 
                  height: 0, 
                  opacity: 0,
                  transition: {
                    height: {
                      duration: 0.3,
                      ease: [0.4, 0, 0.2, 1]
                    },
                    opacity: {
                      duration: 0.2,
                      ease: "easeIn"
                    }
                  }
                }}
                style={{ overflow: "hidden" }}
              >
                <CardContent className="pt-0">
                  <motion.div
                    initial={{ y: -10 }}
                    animate={{ 
                      y: 0,
                      transition: {
                        duration: 0.3,
                        delay: 0.1,
                        ease: "easeOut"
                      }
                    }}
                    exit={{ y: -10 }}
                  >
                    <UpcomingHolidays holidays={holidays} />
                  </motion.div>
                </CardContent>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      </div>

      {/* Attendance Details Modal */}
      <AttendanceDetailsModal
        open={showDetailsModal}
        onClose={() => setShowDetailsModal(false)}
        details={selectedDate ? attendanceDetailsData[selectedDate] : null}
        onRequestAdjustment={handleRequestAdjustment}
        adjustmentRequest={
          selectedDate
            ? adjustmentRequests.find((request) => request.date === selectedDate) ?? null
            : null
        }
      />

      {/* Attendance Adjustment Modal */}
      <AttendanceAdjustmentModal
        open={showAdjustmentModal}
        onClose={() => {
          setShowAdjustmentModal(false);
          setEditingRequest(null);
          setPrefilledTimes(null);
        }}
        selectedDate={selectedDate}
        existingRequest={editingRequest}
        prefilledTimes={prefilledTimes}
        onSubmit={handleSubmitAdjustment}
        onDelete={handleDeleteAdjustment}
        onRevoke={handleRevokeAdjustment}
        isLoading={isLoadingAdjustmentRequests}
      />
    </div>
  );
}