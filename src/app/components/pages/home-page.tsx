import { useState } from "react";
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
  getAttendanceDetails,
  getInitialAdjustmentRequests,
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
  holidays,
  workingHours,
  scheduledStartTime,
  apiBaseUrl,
  accessToken,
  employmentOptions,
  onEmployeeClick,
}: HomePageProps) {
  // Card visibility states - hidden by default
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isEmployeesOpen, setIsEmployeesOpen] = useState(false);
  const [isHolidaysOpen, setIsHolidaysOpen] = useState(false);

  // Attendance details and adjustment state
  const [attendanceDetailsData] = useState(getAttendanceDetails());
  const [adjustmentRequests, setAdjustmentRequests] = useState<AttendanceAdjustmentRequest[]>(
    getInitialAdjustmentRequests()
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [editingRequest, setEditingRequest] = useState<AttendanceAdjustmentRequest | null>(null);
  const [prefilledTimes, setPrefilledTimes] = useState<{ clockIn: string; clockOut: string } | null>(null);

  // Handle date click from mini calendar
  const handleDateClick = (date: string) => {
    setSelectedDate(date);
    
    // Check if there's an existing adjustment request for this date
    const existingRequest = adjustmentRequests.find(req => req.date === date);
    
    if (existingRequest) {
      setEditingRequest(existingRequest);
      setShowAdjustmentModal(true);
    } else {
      setShowDetailsModal(true);
    }
  };

  // Handle request adjustment from details modal
  const handleRequestAdjustment = (date: string) => {
    setSelectedDate(date);
    setEditingRequest(null);
    
    // Prefill times from attendance details if available
    const details = attendanceDetailsData[date];
    if (details && details.status === "present") {
      setPrefilledTimes({
        clockIn: details.clockInTime || "",
        clockOut: details.clockOutTime || ""
      });
    } else {
      setPrefilledTimes(null);
    }
    
    setShowAdjustmentModal(true);
  };

  // Handle submit adjustment request
  const handleSubmitAdjustment = (
    request: Omit<AttendanceAdjustmentRequest, "id" | "submittedDate">
  ) => {
    if (editingRequest) {
      // Update existing request
      setAdjustmentRequests(
        adjustmentRequests.map((req) =>
          req.id === editingRequest.id
            ? { ...request, id: req.id, submittedDate: req.submittedDate }
            : req
        )
      );
    } else {
      // Create new request
      const newRequest: AttendanceAdjustmentRequest = {
        ...request,
        id: `adj-att-${Date.now()}`,
        submittedDate: new Date().toLocaleString(),
      };
      setAdjustmentRequests([...adjustmentRequests, newRequest]);
    }
  };

  // Handle delete adjustment request
  const handleDeleteAdjustment = (requestId: string) => {
    setAdjustmentRequests(adjustmentRequests.filter((req) => req.id !== requestId));
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
      />
    </div>
  );
}