import { useState } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, Plus, Edit, Trash2, Calendar as CalendarIcon, CalendarRange, CalendarDays, Check, X, FileText, Paperclip, Eye, Clock, CheckCircle, XCircle, AlertCircle, CalendarCheck } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "../ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../ui/alert-dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Badge } from "../ui/badge";
import { Textarea } from "../ui/textarea";
import { toast } from "sonner";
import { format } from "date-fns";

interface Holiday {
  id: string;
  name: string;
  date: string;
  type: 'public' | 'personal';
  daysUntil: number;
}

interface LeaveType {
  id: string;
  name: string;
  credits: number;
  accrued: number;
  limit: number;
  requests: LeaveRequest[];
}

interface LogEntry {
  status: "pending" | "approved" | "denied" | "cancelled";
  date: Date;
  approvedBy?: string;
}

interface LeaveRequest {
  id: string;
  startDate: Date;
  endDate: Date;
  message: string;
  status: "approved" | "denied" | "pending" | "cancelled";
  submittedDate: Date;
  attachments: string[];
  logTrail: LogEntry[];
}

interface CalendarPageProps {
  attendanceData: Record<string, 'present' | 'absent' | 'holiday' | 'late'>;
  holidays: Holiday[];
  onAddHoliday: (holiday: Omit<Holiday, 'id' | 'daysUntil'>) => void;
  onEditHoliday: (id: string, holiday: Omit<Holiday, 'id' | 'daysUntil'>) => void;
  onDeleteHoliday: (id: string) => void;
}

export function CalendarPage({ 
  attendanceData, 
  holidays, 
  onAddHoliday, 
  onEditHoliday, 
  onDeleteHoliday 
}: CalendarPageProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [isHolidayDialogOpen, setIsHolidayDialogOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
  const [holidayForm, setHolidayForm] = useState({
    name: "",
    date: "",
    type: "personal" as "public" | "personal"
  });
  
  // Collapsible card states
  const [isFullCalendarOpen, setIsFullCalendarOpen] = useState(false);

  // Bulk holiday states
  const [bulkMode, setBulkMode] = useState<'none' | 'range' | 'multi'>('none');
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [rangeStart, setRangeStart] = useState<string>('');
  const [rangeEnd, setRangeEnd] = useState<string>('');
  const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);
  const [bulkHolidayForm, setBulkHolidayForm] = useState({
    name: "",
    type: "personal" as "public" | "personal"
  });

  // Leave management state
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([
    {
      id: "bereavement",
      name: "Bereavement Leave",
      credits: 5,
      accrued: 5,
      limit: 10,
      requests: [
        {
          id: "req1",
          startDate: new Date(2025, 8, 15),
          endDate: new Date(2025, 8, 17),
          message: "Family emergency",
          status: "approved",
          submittedDate: new Date(2025, 8, 10),
          attachments: ["certificate.pdf"],
          logTrail: [
            { status: "pending", date: new Date(2025, 8, 10) },
            { status: "approved", date: new Date(2025, 8, 11), approvedBy: "Sarah Martinez" },
          ],
        },
      ],
    },
    {
      id: "compensatory",
      name: "Compensatory Time Off",
      credits: 3,
      accrued: 3,
      limit: 10,
      requests: [
        {
          id: "req-cto-1",
          startDate: new Date(2026, 6, 28),
          endDate: new Date(2026, 6, 28),
          message: "Using compensatory time off earned from overtime work during the June product launch.",
          status: "pending",
          submittedDate: new Date(2026, 6, 21),
          attachments: [],
          logTrail: [
            { status: "pending", date: new Date(2026, 6, 21) },
          ],
        },
      ],
    },
    {
      id: "emergency",
      name: "Emergency Leave",
      credits: 4,
      accrued: 4,
      limit: 10,
      requests: [
        {
          id: "req2",
          startDate: new Date(2025, 7, 20),
          endDate: new Date(2025, 7, 20),
          message: "Medical emergency",
          status: "denied",
          submittedDate: new Date(2025, 7, 18),
          attachments: [],
          logTrail: [
            { status: "pending", date: new Date(2025, 7, 18) },
            { status: "denied", date: new Date(2025, 7, 19), approvedBy: "Michael Chen" },
          ],
        },
        {
          id: "req-em-2",
          startDate: new Date(2026, 6, 15),
          endDate: new Date(2026, 6, 15),
          message: "Pipe burst at home â€” needed to wait for the repair crew. Unable to report to work.",
          status: "approved",
          submittedDate: new Date(2026, 6, 15),
          attachments: ["repair-receipt.pdf"],
          logTrail: [
            { status: "pending", date: new Date(2026, 6, 15) },
            { status: "approved", date: new Date(2026, 6, 16), approvedBy: "Sarah Martinez" },
          ],
        },
      ],
    },
    {
      id: "paternity",
      name: "Paternity Leave",
      credits: 5,
      accrued: 5,
      limit: 10,
      requests: [],
    },
    {
      id: "sick",
      name: "Sick Leave",
      credits: 3,
      accrued: 2,
      limit: 10,
      requests: [
        {
          id: "req-sl-1",
          startDate: new Date(2026, 5, 11),
          endDate: new Date(2026, 5, 11),
          message: "Flu symptoms â€” high fever and body aches. Doctor advised rest.",
          status: "approved",
          submittedDate: new Date(2026, 5, 11),
          attachments: ["medical-cert.pdf"],
          logTrail: [
            { status: "pending", date: new Date(2026, 5, 11) },
            { status: "approved", date: new Date(2026, 5, 11), approvedBy: "Sarah Martinez" },
          ],
        },
      ],
    },
    {
      id: "solo-parent",
      name: "Solo Parent Leave",
      credits: 4,
      accrued: 4,
      limit: 10,
      requests: [],
    },
    {
      id: "vacation",
      name: "Vacation Leave",
      credits: 5,
      accrued: 5,
      limit: 10,
      requests: [
        {
          id: "req3",
          startDate: new Date(2025, 9, 1),
          endDate: new Date(2025, 9, 5),
          message: "Family vacation",
          status: "approved",
          submittedDate: new Date(2025, 8, 15),
          attachments: ["itinerary.pdf"],
          logTrail: [
            { status: "pending", date: new Date(2025, 8, 15) },
            { status: "approved", date: new Date(2025, 8, 16), approvedBy: "Sarah Martinez" },
          ],
        },
        {
          id: "req-vl-2",
          startDate: new Date(2026, 6, 14),
          endDate: new Date(2026, 6, 14),
          message: "Annual medical check-up and personal errands.",
          status: "approved",
          submittedDate: new Date(2026, 6, 9),
          attachments: ["appointment-slip.pdf"],
          logTrail: [
            { status: "pending", date: new Date(2026, 6, 9) },
            { status: "approved", date: new Date(2026, 6, 10), approvedBy: "Sarah Martinez" },
          ],
        },
        {
          id: "req-vl-3",
          startDate: new Date(2026, 7, 4),
          endDate: new Date(2026, 7, 7),
          message: "Summer vacation with family.",
          status: "pending",
          submittedDate: new Date(2026, 6, 21),
          attachments: ["travel-itinerary.pdf"],
          logTrail: [
            { status: "pending", date: new Date(2026, 6, 21) },
          ],
        },
      ],
    },
  ]);

  // Leave request state
  const [isLeaveMode, setIsLeaveMode] = useState(false);
  const [leaveSelectedDates, setLeaveSelectedDates] = useState<string[]>([]);
  const [leaveRangeStart, setLeaveRangeStart] = useState<string>('');
  const [leaveRangeEnd, setLeaveRangeEnd] = useState<string>('');
  const [showLeaveRequestDialog, setShowLeaveRequestDialog] = useState(false);
  const [leaveRequestForm, setLeaveRequestForm] = useState({
    leaveType: "" as string,
    startDate: undefined as Date | undefined,
    endDate: undefined as Date | undefined,
    message: "",
    attachments: [] as string[],
  });

  // Leave request details state
  const [selectedLeaveRequest, setSelectedLeaveRequest] = useState<{
    request: LeaveRequest;
    leaveTypeName: string;
    leaveTypeId: string;
  } | null>(null);
  const [showLeaveDetailsDialog, setShowLeaveDetailsDialog] = useState(false);
  const [showCancelConfirmDialog, setShowCancelConfirmDialog] = useState(false);

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    
    const days = [];
    
    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    
    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day);
    }
    
    return days;
  };

  const getDateKey = (day: number) => {
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    return date.toISOString().split('T')[0];
  };

  const getDayStatus = (day: number) => {
    const dateKey = getDateKey(day);
    const holiday = holidays.find(h => h.date === dateKey);
    if (holiday) return 'holiday';
    return attendanceData[dateKey] || null;
  };

  const getStatusColor = (status: string | null, isToday: boolean, dateKey: string) => {
    // Leave mode selection states
    const leaveSelectedDates = getLeaveSelectedDates();
    const isLeaveRangeStart = isLeaveMode && leaveRangeStart === dateKey;
    const isLeaveRangeEnd = isLeaveMode && leaveRangeEnd === dateKey;
    const isInLeaveRange = isLeaveMode && leaveRangeStart && leaveRangeEnd && 
                          getDatesInRange(leaveRangeStart, leaveRangeEnd).includes(dateKey);
    
    // Priority: leave mode selection states
    if (isLeaveRangeStart || isLeaveRangeEnd) {
      return 'bg-vibrant-purple text-vibrant-purple-foreground border-vibrant-purple';
    }
    if (isInLeaveRange) {
      return 'bg-vibrant-purple/30 text-vibrant-purple border-vibrant-purple/50';
    }
    if (isLeaveMode && leaveRangeStart === dateKey) {
      return 'bg-vibrant-purple/50 text-vibrant-purple border-vibrant-purple/70';
    }
    
    const bulkSelectedDates = getBulkSelectedDates();
    const isSelected = bulkSelectedDates.includes(dateKey);
    const isRangeStart = bulkMode === 'range' && rangeStart === dateKey;
    const isRangeEnd = bulkMode === 'range' && rangeEnd === dateKey;
    const isInRange = bulkMode === 'range' && rangeStart && rangeEnd && 
                      getDatesInRange(rangeStart, rangeEnd).includes(dateKey);
    
    // Priority: bulk selection states
    if (isRangeStart || isRangeEnd) {
      return 'bg-vibrant-pink text-vibrant-pink-foreground border-vibrant-pink';
    }
    if (isInRange || isSelected) {
      return 'bg-vibrant-pink/30 text-vibrant-pink border-vibrant-pink/50';
    }
    
    // Regular status colors
    if (isToday) return 'bg-vibrant-blue text-vibrant-blue-foreground';
    
    switch (status) {
      case 'present': return 'bg-vibrant-green/20 text-vibrant-green border-vibrant-green/30';
      case 'late': return 'bg-vibrant-orange/20 text-vibrant-orange border-vibrant-orange/30';
      case 'absent': return 'bg-destructive/20 text-destructive border-destructive/30';
      case 'holiday': return 'bg-vibrant-purple/20 text-vibrant-purple border-vibrant-purple/30';
      default: return 'text-muted-foreground hover:bg-muted/50 border-transparent';
    }
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      if (direction === 'prev') {
        newDate.setMonth(prev.getMonth() - 1);
      } else {
        newDate.setMonth(prev.getMonth() + 1);
      }
      return newDate;
    });
  };

  const handleDayClick = (day: number) => {
    const dateKey = getDateKey(day);
    
    // Handle leave mode selections
    if (isLeaveMode) {
      if (!leaveRangeStart) {
        setLeaveRangeStart(dateKey);
      } else if (!leaveRangeEnd) {
        if (dateKey === leaveRangeStart) {
          // Same date clicked, clear selection
          setLeaveRangeStart('');
        } else {
          // Validate that end date is after start date
          if (new Date(dateKey) < new Date(leaveRangeStart)) {
            toast.error("End date must be after start date");
            return;
          }
          setLeaveRangeEnd(dateKey);
          // Open dialog immediately when range is complete
          const startDate = new Date(leaveRangeStart);
          const endDate = new Date(dateKey);
          setLeaveRequestForm({
            leaveType: "",
            startDate,
            endDate,
            message: "",
            attachments: [],
          });
          setShowLeaveRequestDialog(true);
        }
      } else {
        // Reset and start new range
        setLeaveRangeStart(dateKey);
        setLeaveRangeEnd('');
      }
      return;
    }
    
    // Handle bulk mode selections
    if (bulkMode === 'range') {
      if (!rangeStart) {
        setRangeStart(dateKey);
      } else if (!rangeEnd) {
        if (dateKey === rangeStart) {
          // Same date clicked, clear selection
          setRangeStart('');
        } else {
          setRangeEnd(dateKey);
        }
      } else {
        // Reset and start new range
        setRangeStart(dateKey);
        setRangeEnd('');
      }
      return;
    }
    
    if (bulkMode === 'multi') {
      setSelectedDates(prev => {
        if (prev.includes(dateKey)) {
          return prev.filter(date => date !== dateKey);
        } else {
          return [...prev, dateKey];
        }
      });
      return;
    }
    
    // Regular single day selection
    setSelectedDate(dateKey);
    const existingHoliday = holidays.find(h => h.date === dateKey);
    if (existingHoliday) {
      setEditingHoliday(existingHoliday);
      setHolidayForm({
        name: existingHoliday.name,
        date: existingHoliday.date,
        type: existingHoliday.type
      });
    } else {
      setEditingHoliday(null);
      setHolidayForm({
        name: "",
        date: dateKey,
        type: "personal"
      });
    }
    setIsHolidayDialogOpen(true);
  };

  const handleSaveHoliday = () => {
    if (!holidayForm.name.trim()) {
      toast.error("Please enter a holiday name");
      return;
    }

    if (editingHoliday) {
      onEditHoliday(editingHoliday.id, holidayForm);
      toast.success("Holiday updated successfully");
    } else {
      onAddHoliday(holidayForm);
      toast.success("Holiday added successfully");
    }
    
    setIsHolidayDialogOpen(false);
    setEditingHoliday(null);
    setHolidayForm({ name: "", date: "", type: "personal" });
  };

  const handleDeleteHoliday = () => {
    if (editingHoliday) {
      onDeleteHoliday(editingHoliday.id);
      toast.success("Holiday deleted successfully");
      setIsHolidayDialogOpen(false);
      setEditingHoliday(null);
    }
  };

  const resetBulkMode = () => {
    setBulkMode('none');
    setSelectedDates([]);
    setRangeStart('');
    setRangeEnd('');
    setBulkHolidayForm({ name: "", type: "personal" });
  };

  const getDatesInRange = (start: string, end: string): string[] => {
    let startDate = new Date(start);
    let endDate = new Date(end);
    
    // Ensure start is before end
    if (startDate > endDate) {
      [startDate, endDate] = [endDate, startDate];
    }
    
    const dates: string[] = [];
    const currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
      dates.push(currentDate.toISOString().split('T')[0]);
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return dates;
  };

  const handleBulkSave = () => {
    if (!bulkHolidayForm.name.trim()) {
      toast.error("Please enter a holiday name");
      return;
    }

    let datesToAdd: string[] = [];
    
    if (bulkMode === 'range' && rangeStart && rangeEnd) {
      datesToAdd = getDatesInRange(rangeStart, rangeEnd);
    } else if (bulkMode === 'multi') {
      datesToAdd = selectedDates;
    }

    if (datesToAdd.length === 0) {
      toast.error("Please select dates for the holidays");
      return;
    }

    // Add holidays for each selected date
    datesToAdd.forEach(date => {
      // Check if holiday already exists for this date
      const existingHoliday = holidays.find(h => h.date === date);
      if (!existingHoliday) {
        onAddHoliday({
          name: bulkHolidayForm.name,
          date: date,
          type: bulkHolidayForm.type
        });
      }
    });

    toast.success(`Successfully added ${datesToAdd.length} holiday${datesToAdd.length > 1 ? 's' : ''}`);
    setIsBulkDialogOpen(false);
    resetBulkMode();
  };

  const getBulkSelectedDates = (): string[] => {
    if (bulkMode === 'range' && rangeStart && rangeEnd) {
      return getDatesInRange(rangeStart, rangeEnd);
    }
    if (bulkMode === 'multi') {
      return selectedDates;
    }
    return [];
  };

  const getLeaveSelectedDates = (): string[] => {
    if (leaveRangeStart && leaveRangeEnd) {
      return getDatesInRange(leaveRangeStart, leaveRangeEnd);
    }
    if (leaveRangeStart) {
      return [leaveRangeStart];
    }
    return [];
  };

  const handleStartLeaveMode = () => {
    setIsLeaveMode(true);
    setBulkMode('none');
    setLeaveRangeStart('');
    setLeaveRangeEnd('');
  };

  const handleCancelLeaveMode = () => {
    setIsLeaveMode(false);
    setLeaveRangeStart('');
    setLeaveRangeEnd('');
    setLeaveRequestForm({
      leaveType: "",
      startDate: undefined,
      endDate: undefined,
      message: "",
      attachments: [],
    });
  };

  const handleSubmitLeaveRequest = () => {
    if (!leaveRequestForm.leaveType) {
      toast.error("Please select a leave type");
      return;
    }

    if (!leaveRequestForm.startDate || !leaveRequestForm.endDate) {
      toast.error("Please select start and end dates");
      return;
    }

    if (!leaveRequestForm.message.trim()) {
      toast.error("Please provide a message");
      return;
    }

    if (leaveRequestForm.attachments.length === 0) {
      toast.error("Please upload at least one attachment");
      return;
    }

    if (leaveRequestForm.startDate > leaveRequestForm.endDate) {
      toast.error("End date must be after start date");
      return;
    }

    // Calculate days requested
    const days = Math.ceil(
      (leaveRequestForm.endDate.getTime() - leaveRequestForm.startDate.getTime()) /
        (1000 * 60 * 60 * 24)
    ) + 1;

    const selectedLeaveType = leaveTypes.find(lt => lt.id === leaveRequestForm.leaveType);
    
    if (selectedLeaveType && days > selectedLeaveType.credits) {
      toast.error(`Insufficient leave credits. You have ${selectedLeaveType.credits} days available.`);
      return;
    }

    // Submit the request
    const newRequest: LeaveRequest = {
      id: `req-${Date.now()}`,
      startDate: leaveRequestForm.startDate,
      endDate: leaveRequestForm.endDate,
      message: leaveRequestForm.message,
      status: "pending",
      submittedDate: new Date(),
      attachments: leaveRequestForm.attachments,
      logTrail: [
        { status: "pending", date: new Date() },
      ],
    };

    setLeaveTypes((prev) =>
      prev.map((lt) =>
        lt.id === leaveRequestForm.leaveType
          ? { ...lt, requests: [newRequest, ...lt.requests] }
          : lt
      )
    );

    toast.success("Leave request submitted successfully");
    setShowLeaveRequestDialog(false);
    handleCancelLeaveMode();
  };

  const handleViewLeaveDetails = (request: LeaveRequest, leaveTypeName: string, leaveTypeId: string) => {
    setSelectedLeaveRequest({ request, leaveTypeName, leaveTypeId });
    setShowLeaveDetailsDialog(true);
  };

  const handleCancelLeaveRequest = () => {
    if (!selectedLeaveRequest) return;

    setLeaveTypes((prev) =>
      prev.map((lt) =>
        lt.id === selectedLeaveRequest.leaveTypeId
          ? {
              ...lt,
              requests: lt.requests.map((req) =>
                req.id === selectedLeaveRequest.request.id
                  ? {
                      ...req,
                      status: "cancelled" as const,
                      logTrail: [
                        ...req.logTrail,
                        { status: "cancelled" as const, date: new Date() },
                      ],
                    }
                  : req
              ),
            }
          : lt
      )
    );

    toast.success("Leave request cancelled successfully");
    setShowCancelConfirmDialog(false);
    setShowLeaveDetailsDialog(false);
    setSelectedLeaveRequest(null);
  };

  const handleFileUpload = () => {
    // Simulate file upload
    const fileName = `document-${Date.now()}.pdf`;
    setLeaveRequestForm((prev) => ({
      ...prev,
      attachments: [...prev.attachments, fileName],
    }));
    toast.success("File uploaded successfully");
  };

  const handleRemoveAttachment = (index: number) => {
    setLeaveRequestForm((prev) => ({
      ...prev,
      attachments: prev.attachments.filter((_, i) => i !== index),
    }));
  };

  const monthYear = currentDate.toLocaleDateString('en-US', { 
    month: 'long', 
    year: 'numeric' 
  });

  const days = getDaysInMonth(currentDate);
  const today = new Date();
  const isCurrentMonth = currentDate.getMonth() === today.getMonth() && 
                         currentDate.getFullYear() === today.getFullYear();

  const monthHolidays = holidays.filter(holiday => {
    const holidayDate = new Date(holiday.date);
    return holidayDate.getMonth() === currentDate.getMonth() && 
           holidayDate.getFullYear() === currentDate.getFullYear();
  });

  return (
    <div className="space-y-6 pb-20">
      <div className="px-4 space-y-4">
        <Card>
          <CardHeader 
            className="pb-3 cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={() => setIsFullCalendarOpen(!isFullCalendarOpen)}
          >
            <div className="flex items-center justify-between w-full">
              <CardTitle className="flex items-center gap-2">
                <CalendarCheck className="h-5 w-5 text-vibrant-blue" />
                Full Calendar
              </CardTitle>
              <div className="flex items-center gap-2">
                {isFullCalendarOpen && (
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => navigateMonth('prev')}
                      className="h-8 w-8"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm font-medium min-w-[100px] text-center">
                      {monthYear}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => navigateMonth('next')}
                      className="h-8 w-8"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                <motion.div
                  animate={{ rotate: isFullCalendarOpen ? 180 : 0 }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsFullCalendarOpen(!isFullCalendarOpen);
                    }}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </motion.div>
              </div>
            </div>
          </CardHeader>
          <AnimatePresence initial={false}>
            {isFullCalendarOpen && (
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
            <div className="grid grid-cols-7 gap-1 mb-3">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => (
                <div key={`header-${index}`} className="text-center text-sm font-medium text-muted-foreground p-2">
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {days.map((day, index) => {
                if (!day) {
                  return <div key={`empty-${index}`} className="p-2 h-12" />;
                }
                
                const isToday = isCurrentMonth && day === today.getDate();
                const status = getDayStatus(day);
                const holiday = holidays.find(h => h.date === getDateKey(day));
                const dateKey = getDateKey(day);
                
                return (
                  <button
                    key={`calendar-day-${currentDate.getMonth()}-${day}`}
                    onClick={() => handleDayClick(day)}
                    className={`p-2 h-12 text-sm rounded-md border transition-all hover:scale-105 ${getStatusColor(status, isToday, dateKey)}`}
                  >
                    <div className="flex flex-col items-center">
                      <span>{day}</span>
                      {holiday && (
                        <div className="w-1 h-1 bg-current rounded-full mt-1" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            
            <div className="space-y-2 mt-4">
              <div className="flex justify-center gap-4 text-xs flex-wrap">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-vibrant-blue" />
                  <span className="text-muted-foreground">Today</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-vibrant-green/20 border border-vibrant-green/30" />
                  <span className="text-muted-foreground">Present</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-vibrant-orange/20 border border-vibrant-orange/30" />
                  <span className="text-muted-foreground">Late</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-destructive/20 border border-destructive/30" />
                  <span className="text-muted-foreground">Absent</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-vibrant-purple/20 border border-vibrant-purple/30" />
                  <span className="text-muted-foreground">Holiday</span>
                </div>
              </div>
            </div>

            {/* Holidays This Month */}
            <div className="pt-4 border-t mt-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-3">
                <h3 className="font-medium">Holidays This Month</h3>
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  {bulkMode === 'none' && (
                    <>
                      <Button
                        size="sm"
                        className="bg-vibrant-purple hover:bg-vibrant-purple/90 text-vibrant-purple-foreground flex-1 sm:flex-none"
                        onClick={() => {
                          setEditingHoliday(null);
                          setHolidayForm({ name: "", date: "", type: "personal" });
                          setIsHolidayDialogOpen(true);
                        }}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        <span className="hidden xs:inline">Add Holiday</span>
                        <span className="xs:hidden">Add</span>
                      </Button>
                      
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-vibrant-pink text-vibrant-pink hover:bg-vibrant-pink hover:text-vibrant-pink-foreground flex-1 sm:flex-none"
                        onClick={() => setBulkMode('range')}
                      >
                        <CalendarRange className="h-4 w-4 mr-2" />
                        <span className="hidden xs:inline">Add Multiple</span>
                        <span className="xs:hidden">Multiple</span>
                      </Button>
                    </>
                  )}
                </div>
              </div>
              
              {monthHolidays.length === 0 ? (
                <p className="text-muted-foreground text-center py-4 text-sm">
                  No holidays this month
                </p>
              ) : (
                <div className="space-y-2">
                  {monthHolidays.map(holiday => (
                    <div
                      key={holiday.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => {
                        setEditingHoliday(holiday);
                        setHolidayForm({
                          name: holiday.name,
                          date: holiday.date,
                          type: holiday.type,
                        });
                        setIsHolidayDialogOpen(true);
                      }}
                    >
                      <div>
                        <p className="font-medium">{holiday.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(holiday.date).toLocaleDateString('en-US', {
                            month: 'long',
                            day: 'numeric'
                          })}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={`${
                          holiday.type === 'public'
                            ? 'border-vibrant-blue text-vibrant-blue'
                            : 'border-vibrant-pink text-vibrant-pink'
                        }`}
                      >
                        {holiday.type}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Leave Management */}
            <div className="pt-4 border-t mt-4">
              <h3 className="font-medium mb-3">Leave Management</h3>
              {!isLeaveMode ? (
                <div className="space-y-3">
                  <Button
                    onClick={handleStartLeaveMode}
                    className="w-full bg-vibrant-purple hover:bg-vibrant-purple/90 text-vibrant-purple-foreground"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Request Leave
                  </Button>
                  
                  {/* Leave Types Summary */}
                  <div className="space-y-2">
                    {leaveTypes.map((leaveType) => (
                      <div
                        key={leaveType.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                      >
                        <div className="flex-1">
                          <p className="text-sm font-medium">{leaveType.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {leaveType.accrued} accrued so far this year
                          </p>
                        </div>
                        <Badge className="bg-vibrant-blue/20 text-vibrant-blue">
                          {leaveType.credits} left
                        </Badge>
                      </div>
                    ))}
                  </div>

                  {/* Recent Leave Requests */}
                  {leaveTypes.some(lt => lt.requests.length > 0) && (
                    <div className="pt-3 border-t border-border">
                      <Label className="text-sm mb-2 block">Recent Requests</Label>
                      <div className="space-y-2">
                        {leaveTypes
                          .flatMap(lt => lt.requests.map(req => ({ ...req, leaveTypeName: lt.name, leaveTypeId: lt.id })))
                          .sort((a, b) => b.submittedDate.getTime() - a.submittedDate.getTime())
                          .slice(0, 5)
                          .map((request) => (
                            <div
                              key={request.id}
                              className="flex items-start justify-between p-3 rounded bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
                              onClick={() => handleViewLeaveDetails(request, request.leaveTypeName, request.leaveTypeId)}
                            >
                              <div className="flex-1">
                                <p className="text-sm font-medium">{request.leaveTypeName}</p>
                                <p className="text-xs text-muted-foreground">
                                  {format(request.startDate, "MMM dd")}-{format(request.endDate, "dd, yyyy")}
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                                  {request.message}
                                </p>
                              </div>
                              <div className="ml-3 flex items-center gap-2">
                                {request.status === "approved" && (
                                  <Badge className="bg-vibrant-green/20 text-vibrant-green">
                                    approved
                                  </Badge>
                                )}
                                {request.status === "denied" && (
                                  <Badge className="bg-red-500/20 text-red-600">
                                    denied
                                  </Badge>
                                )}
                                {request.status === "pending" && (
                                  <Badge className="bg-vibrant-orange/20 text-vibrant-orange">
                                    pending
                                  </Badge>
                                )}
                                {request.status === "cancelled" && (
                                  <Badge className="bg-muted-foreground/20 text-muted-foreground">
                                    cancelled
                                  </Badge>
                                )}
                                <Eye className="h-4 w-4 text-muted-foreground" />
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="bg-vibrant-purple/10 border border-vibrant-purple/30 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <CalendarIcon className="h-4 w-4 text-vibrant-purple" />
                        <span className="text-sm font-medium text-vibrant-purple">
                          Leave Request Mode
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCancelLeaveMode}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-4 w-4 mr-1" />
                        Cancel
                      </Button>
                    </div>
                    
                    <div className="text-xs text-muted-foreground space-y-1">
                      {!leaveRangeStart ? (
                        <p>Select the start date of your leave on the calendar above</p>
                      ) : !leaveRangeEnd ? (
                        <p>Now select the end date (must be after {format(new Date(leaveRangeStart), "MMM dd, yyyy")})</p>
                      ) : (
                        <p>
                          Leave period selected: {getDatesInRange(leaveRangeStart, leaveRangeEnd).length} day(s)
                          <br />
                          {format(new Date(leaveRangeStart), "MMM dd")} - {format(new Date(leaveRangeEnd), "MMM dd, yyyy")}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
                </CardContent>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>

        {/* Bulk Mode Controls */}
        {bulkMode !== 'none' && (
          <Card className="border-vibrant-pink/30 bg-vibrant-pink/5">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {bulkMode === 'range' ? (
                    <CalendarRange className="h-4 w-4 text-vibrant-pink" />
                  ) : (
                    <CalendarDays className="h-4 w-4 text-vibrant-pink" />
                  )}
                  <span className="text-sm font-medium text-vibrant-pink">
                    {bulkMode === 'range' ? 'Date Range Mode' : 'Multi-Date Mode'}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetBulkMode}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
              </div>
              
              <div className="text-xs text-muted-foreground mb-3">
                {bulkMode === 'range' && (
                  <p>
                    {!rangeStart 
                      ? "Click on a date to set the start of your range" 
                      : !rangeEnd 
                        ? "Click on another date to complete your range" 
                        : `Range selected: ${getDatesInRange(rangeStart, rangeEnd).length} days`
                    }
                  </p>
                )}
                {bulkMode === 'multi' && (
                  <p>
                    {selectedDates.length === 0 
                      ? "Click on dates to select multiple holidays" 
                      : `${selectedDates.length} date${selectedDates.length > 1 ? 's' : ''} selected`
                    }
                  </p>
                )}
              </div>
              
              {((bulkMode === 'range' && rangeStart && rangeEnd) || 
                (bulkMode === 'multi' && selectedDates.length > 0)) && (
                <Button
                  size="sm"
                  onClick={() => setIsBulkDialogOpen(true)}
                  className="bg-vibrant-pink hover:bg-vibrant-pink/90 text-vibrant-pink-foreground"
                >
                  <Check className="h-4 w-4 mr-2" />
                  Add Holidays
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Holiday Management Dialog */}
        <Dialog open={isHolidayDialogOpen} onOpenChange={setIsHolidayDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingHoliday ? 'Edit Holiday' : 'Add Holiday'}
              </DialogTitle>
              <DialogDescription>
                {editingHoliday ? 'Modify the holiday details below.' : 'Add a new holiday to your calendar.'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="holiday-name">Holiday Name</Label>
                <Input
                  id="holiday-name"
                  value={holidayForm.name}
                  onChange={(e) => setHolidayForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter holiday name"
                />
              </div>
              <div>
                <Label htmlFor="holiday-date">Date</Label>
                <Input
                  id="holiday-date"
                  type="date"
                  value={holidayForm.date}
                  onChange={(e) => setHolidayForm(prev => ({ ...prev, date: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="holiday-type">Type</Label>
                <Select
                  value={holidayForm.type}
                  onValueChange={(value: "public" | "personal") => 
                    setHolidayForm(prev => ({ ...prev, type: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="personal">Personal</SelectItem>
                    <SelectItem value="public">Public</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSaveHoliday} className="flex-1">
                  {editingHoliday ? 'Update' : 'Add'} Holiday
                </Button>
                {editingHoliday && (
                  <Button
                    variant="destructive"
                    onClick={handleDeleteHoliday}
                    size="icon"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>



        {/* Bulk Holiday Dialog */}
        <Dialog open={isBulkDialogOpen} onOpenChange={setIsBulkDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Multiple Holidays</DialogTitle>
              <DialogDescription>
                Set details for the selected {getBulkSelectedDates().length} holiday{getBulkSelectedDates().length > 1 ? 's' : ''}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="bulk-holiday-name">Holiday Name</Label>
                <Input
                  id="bulk-holiday-name"
                  value={bulkHolidayForm.name}
                  onChange={(e) => setBulkHolidayForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter holiday name"
                />
              </div>
              <div>
                <Label htmlFor="bulk-holiday-type">Type</Label>
                <Select
                  value={bulkHolidayForm.type}
                  onValueChange={(value: "public" | "personal") => 
                    setBulkHolidayForm(prev => ({ ...prev, type: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="personal">Personal</SelectItem>
                    <SelectItem value="public">Public</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="bg-muted/30 p-3 rounded-lg">
                <p className="text-sm font-medium mb-2">Selected Dates:</p>
                <div className="max-h-32 overflow-y-auto">
                  <div className="text-xs text-muted-foreground space-y-1">
                    {getBulkSelectedDates().map(date => (
                      <div key={date}>
                        {new Date(date).toLocaleDateString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              
              <div className="flex gap-2">
                <Button onClick={handleBulkSave} className="flex-1">
                  Add {getBulkSelectedDates().length} Holiday{getBulkSelectedDates().length > 1 ? 's' : ''}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setIsBulkDialogOpen(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Leave Request Dialog */}
        <Dialog open={showLeaveRequestDialog} onOpenChange={setShowLeaveRequestDialog}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Leave Request</DialogTitle>
              <DialogDescription>
                Fill in the details for your leave request
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Leave Type Selection */}
              <div>
                <Label>Leave Type *</Label>
                <Select
                  value={leaveRequestForm.leaveType}
                  onValueChange={(value) =>
                    setLeaveRequestForm((prev) => ({
                      ...prev,
                      leaveType: value,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select leave type" />
                  </SelectTrigger>
                  <SelectContent>
                    {leaveTypes.map((leaveType) => (
                      <SelectItem key={leaveType.id} value={leaveType.id}>
                        {leaveType.name} ({leaveType.credits} days available)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {leaveRequestForm.leaveType && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Available balance:{" "}
                    {leaveTypes.find((lt) => lt.id === leaveRequestForm.leaveType)?.credits} days
                  </p>
                )}
              </div>

              {/* Mini Calendar for Date Selection */}
              <div className="border rounded-lg p-4 bg-muted/20">
                <Label className="mb-3 block">Select Leave Dates</Label>
                <div className="space-y-3">
                  {/* Current Calendar View */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => navigateMonth('prev')}
                        className="h-8 w-8"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="font-medium">
                        {currentDate.toLocaleDateString('en-US', { 
                          month: 'long', 
                          year: 'numeric' 
                        })}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => navigateMonth('next')}
                        className="h-8 w-8"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    <div className="grid grid-cols-7 gap-1 mb-2">
                      {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
                        <div key={`header-${index}`} className="text-center text-xs font-medium text-muted-foreground p-1">
                          {day}
                        </div>
                      ))}
                    </div>
                    
                    <div className="grid grid-cols-7 gap-1">
                      {days.map((day, index) => {
                        if (!day) {
                          return <div key={`empty-${index}`} className="p-1 h-8" />;
                        }
                        
                        const isToday = isCurrentMonth && day === today.getDate();
                        const dateKey = getDateKey(day);
                        const holiday = holidays.find(h => h.date === dateKey);
                        
                        // Check if this date is in the leave range
                        const isLeaveStart = leaveRangeStart === dateKey;
                        const isLeaveEnd = leaveRangeEnd === dateKey;
                        const isInLeaveRange = leaveRangeStart && leaveRangeEnd && 
                                              getDatesInRange(leaveRangeStart, leaveRangeEnd).includes(dateKey);
                        
                        let bgColor = 'hover:bg-muted/50';
                        if (isLeaveStart || isLeaveEnd) {
                          bgColor = 'bg-vibrant-purple text-vibrant-purple-foreground';
                        } else if (isInLeaveRange) {
                          bgColor = 'bg-vibrant-purple/30 text-vibrant-purple';
                        } else if (isToday) {
                          bgColor = 'bg-vibrant-blue/20 text-vibrant-blue border-vibrant-blue';
                        } else if (holiday) {
                          bgColor = 'bg-vibrant-pink/20 text-vibrant-pink';
                        }
                        
                        return (
                          <button
                            key={`calendar-day-${currentDate.getMonth()}-${day}`}
                            onClick={() => handleDayClick(day)}
                            className={`p-1 h-8 text-xs rounded border transition-all ${bgColor}`}
                          >
                            {day}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Selected Dates Display */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">From Date</p>
                      <div className="p-2 bg-background rounded text-xs font-medium">
                        {leaveRequestForm.startDate
                          ? format(leaveRequestForm.startDate, "MMM dd, yyyy")
                          : "Not selected"}
                      </div>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground mb-1">To Date</p>
                      <div className="p-2 bg-background rounded text-xs font-medium">
                        {leaveRequestForm.endDate
                          ? format(leaveRequestForm.endDate, "MMM dd, yyyy")
                          : "Not selected"}
                      </div>
                    </div>
                  </div>
                  
                  <p className="text-xs text-muted-foreground">
                    <AlertCircle className="h-3 w-3 inline mr-1" />
                    Click on the calendar to select your leave start and end dates
                  </p>
                </div>
              </div>

              {/* Days Count */}
              {leaveRequestForm.startDate && leaveRequestForm.endDate && (
                <div className="bg-vibrant-blue/10 border border-vibrant-blue/30 rounded-lg p-3">
                  <p className="text-sm text-vibrant-blue">
                    Total days requested:{" "}
                    {Math.ceil(
                      (leaveRequestForm.endDate.getTime() -
                        leaveRequestForm.startDate.getTime()) /
                        (1000 * 60 * 60 * 24)
                    ) + 1}{" "}
                    day(s)
                  </p>
                </div>
              )}

              {/* Message */}
              <div>
                <Label htmlFor="leave-message">Message *</Label>
                <Textarea
                  id="leave-message"
                  placeholder="Please provide reason for leave request..."
                  rows={4}
                  value={leaveRequestForm.message}
                  onChange={(e) =>
                    setLeaveRequestForm((prev) => ({
                      ...prev,
                      message: e.target.value,
                    }))
                  }
                />
              </div>

              {/* Attachments */}
              <div>
                <Label>Attachments *</Label>
                <div className="space-y-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={handleFileUpload}
                  >
                    <Paperclip className="h-4 w-4 mr-2" />
                    Upload Document
                  </Button>

                  {leaveRequestForm.attachments.length > 0 && (
                    <div className="space-y-2">
                      {leaveRequestForm.attachments.map((file, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-2 bg-muted rounded"
                        >
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-vibrant-blue" />
                            <span className="text-sm">{file}</span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveAttachment(index)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowLeaveRequestDialog(false);
                  handleCancelLeaveMode();
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmitLeaveRequest}
                className="bg-vibrant-purple hover:bg-vibrant-purple/90 text-vibrant-purple-foreground"
              >
                Submit Request
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Leave Request Details Dialog */}
        <Dialog open={showLeaveDetailsDialog} onOpenChange={setShowLeaveDetailsDialog}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between">
                <span>Leave Request Details</span>
                {selectedLeaveRequest && (
                  <Badge
                    className={
                      selectedLeaveRequest.request.status === "approved"
                        ? "bg-vibrant-green/20 text-vibrant-green"
                        : selectedLeaveRequest.request.status === "denied"
                        ? "bg-red-500/20 text-red-600"
                        : selectedLeaveRequest.request.status === "cancelled"
                        ? "bg-muted-foreground/20 text-muted-foreground"
                        : "bg-vibrant-orange/20 text-vibrant-orange"
                    }
                  >
                    {selectedLeaveRequest.request.status}
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription>
                {selectedLeaveRequest?.leaveTypeName}
              </DialogDescription>
            </DialogHeader>

            {selectedLeaveRequest && (
              <div className="space-y-4">
                {/* Date Range */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>From Date</Label>
                    <div className="p-3 bg-muted rounded-md text-sm">
                      {format(selectedLeaveRequest.request.startDate, "PPP")}
                    </div>
                  </div>
                  <div>
                    <Label>To Date</Label>
                    <div className="p-3 bg-muted rounded-md text-sm">
                      {format(selectedLeaveRequest.request.endDate, "PPP")}
                    </div>
                  </div>
                </div>

                {/* Days Count */}
                <div className="bg-vibrant-blue/10 border border-vibrant-blue/30 rounded-lg p-3">
                  <p className="text-sm text-vibrant-blue">
                    Total days:{" "}
                    {Math.ceil(
                      (selectedLeaveRequest.request.endDate.getTime() -
                        selectedLeaveRequest.request.startDate.getTime()) /
                        (1000 * 60 * 60 * 24)
                    ) + 1}{" "}
                    day(s)
                  </p>
                </div>

                {/* Message */}
                <div>
                  <Label>Reason</Label>
                  <div className="p-3 bg-muted rounded-md text-sm">
                    {selectedLeaveRequest.request.message}
                  </div>
                </div>

                {/* Attachments */}
                {selectedLeaveRequest.request.attachments.length > 0 && (
                  <div>
                    <Label>Attachments</Label>
                    <div className="space-y-2 mt-2">
                      {selectedLeaveRequest.request.attachments.map((file, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-2 p-2 bg-muted rounded"
                        >
                          <FileText className="h-4 w-4 text-vibrant-blue" />
                          <span className="text-sm">{file}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Log Trail */}
                <div>
                  <Label className="mb-3 block">Request Log Trail</Label>
                  <div className="space-y-3">
                    {selectedLeaveRequest.request.logTrail.map((log, index) => (
                      <div
                        key={index}
                        className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg"
                      >
                        <div className="mt-1">
                          {log.status === "pending" && (
                            <Clock className="h-5 w-5 text-vibrant-orange" />
                          )}
                          {log.status === "approved" && (
                            <CheckCircle className="h-5 w-5 text-vibrant-green" />
                          )}
                          {log.status === "denied" && (
                            <XCircle className="h-5 w-5 text-red-600" />
                          )}
                          {log.status === "cancelled" && (
                            <AlertCircle className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium capitalize">
                              {log.status}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {format(log.date, "MMM dd, yyyy 'at' h:mm a")}
                            </p>
                          </div>
                          {log.approvedBy && (
                            <p className="text-xs text-muted-foreground mt-1">
                              By: {log.approvedBy} (HR)
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowLeaveDetailsDialog(false);
                  setSelectedLeaveRequest(null);
                }}
              >
                Close
              </Button>
              {selectedLeaveRequest && 
               selectedLeaveRequest.request.status !== "denied" && 
               selectedLeaveRequest.request.status !== "cancelled" && (
                <Button
                  variant="destructive"
                  onClick={() => setShowCancelConfirmDialog(true)}
                >
                  <X className="h-4 w-4 mr-2" />
                  Cancel Request
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Cancel Confirmation Dialog */}
        <AlertDialog open={showCancelConfirmDialog} onOpenChange={setShowCancelConfirmDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel Leave Request?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to cancel this leave request? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {selectedLeaveRequest && (
              <div className="px-6 pb-2">
                <div className="p-3 bg-muted rounded-lg text-sm">
                  <p className="font-medium text-foreground">
                    {selectedLeaveRequest.leaveTypeName}
                  </p>
                  <p className="text-xs mt-1 text-muted-foreground">
                    {format(selectedLeaveRequest.request.startDate, "MMM dd")} -{" "}
                    {format(selectedLeaveRequest.request.endDate, "MMM dd, yyyy")}
                  </p>
                </div>
              </div>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel>No, Keep It</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleCancelLeaveRequest}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Yes, Cancel Request
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
