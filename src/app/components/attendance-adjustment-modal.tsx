import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Badge } from "./ui/badge";
import { Calendar } from "./ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import {
  AlertCircle,
  CalendarIcon,
  Upload,
  X,
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  Trash2,
  Download,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner@2.0.3";
import { AttendanceAdjustmentRequest } from "./attendance-details-data";
import { cn } from "./ui/utils";

interface AttendanceAdjustmentModalProps {
  open: boolean;
  onClose: () => void;
  selectedDate: string | null;
  existingRequest?: AttendanceAdjustmentRequest | null;
  prefilledTimes?: { clockIn: string; clockOut: string } | null;
  onSubmit: (request: Omit<AttendanceAdjustmentRequest, "id" | "submittedDate">) => void;
  onDelete?: (requestId: string) => void;
}

export function AttendanceAdjustmentModal({
  open,
  onClose,
  selectedDate,
  existingRequest,
  prefilledTimes,
  onSubmit,
  onDelete,
}: AttendanceAdjustmentModalProps) {
  const [reason, setReason] = useState<"Forgot to Clock-in/Clock-out" | "Missing logs">(
    "Forgot to Clock-in/Clock-out"
  );
  const [shiftDateFrom, setShiftDateFrom] = useState<Date | undefined>(undefined);
  const [shiftDateTo, setShiftDateTo] = useState<Date | undefined>(undefined);
  const [clockInTime, setClockInTime] = useState("");
  const [clockOutTime, setClockOutTime] = useState("");
  const [breakDuration, setBreakDuration] = useState("60");
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);

  // Initialize form with existing request or selected date
  useEffect(() => {
    if (open) {
      if (existingRequest) {
        setReason(existingRequest.reason);
        setShiftDateFrom(new Date(existingRequest.shiftDateFrom));
        setShiftDateTo(new Date(existingRequest.shiftDateTo));
        setClockInTime(existingRequest.clockInTime);
        setClockOutTime(existingRequest.clockOutTime);
        setBreakDuration(existingRequest.breakDuration.toString());
        setMessage(existingRequest.message);
        setAttachments(existingRequest.attachments);
      } else if (selectedDate) {
        setShiftDateFrom(new Date(selectedDate));
        setShiftDateTo(new Date(selectedDate));
        setReason("Forgot to Clock-in/Clock-out");
        // Use prefilled times if available, otherwise empty strings
        setClockInTime(prefilledTimes?.clockIn || "");
        setClockOutTime(prefilledTimes?.clockOut || "");
        setBreakDuration("60");
        setMessage("");
        setAttachments([]);
      }
    }
  }, [open, selectedDate, existingRequest, prefilledTimes]);

  const calculateWorkDuration = () => {
    if (!clockInTime || !clockOutTime) return "0h 0m";

    const [inHour, inMin] = clockInTime.split(":").map(Number);
    const [outHour, outMin] = clockOutTime.split(":").map(Number);

    const totalMinutes = outHour * 60 + outMin - (inHour * 60 + inMin) - Number(breakDuration);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return `${hours}h ${minutes}m`;
  };

  const handleSubmit = () => {
    // Validation
    if (!reason) {
      toast.error("Please select a reason");
      return;
    }
    if (!shiftDateFrom || !shiftDateTo) {
      toast.error("Please select shift dates");
      return;
    }
    if (!clockInTime || !clockOutTime) {
      toast.error("Please enter clock-in and clock-out times");
      return;
    }
    if (!message.trim()) {
      toast.error("Please enter a message");
      return;
    }

    const request: Omit<AttendanceAdjustmentRequest, "id" | "submittedDate"> = {
      date: selectedDate || format(shiftDateFrom, "yyyy-MM-dd"),
      reason,
      shiftDateFrom: format(shiftDateFrom, "yyyy-MM-dd"),
      shiftDateTo: format(shiftDateTo, "yyyy-MM-dd"),
      clockInTime,
      clockOutTime,
      breakDuration: Number(breakDuration),
      totalWorkDuration: calculateWorkDuration(),
      message,
      attachments,
      status: existingRequest?.status || "pending",
      approvedBy: existingRequest?.approvedBy,
      approvedDate: existingRequest?.approvedDate,
      deniedReason: existingRequest?.deniedReason,
    };

    onSubmit(request);
    toast.success(
      existingRequest
        ? "Adjustment request updated successfully"
        : "Adjustment request submitted successfully"
    );
    onClose();
  };

  const handleAddAttachment = () => {
    const fileName = `document-${Date.now()}.pdf`;
    setAttachments([...attachments, fileName]);
    toast.success("Attachment added");
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachments(attachments.filter((_, i) => i !== index));
    toast.success("Attachment removed");
  };

  const handleDelete = () => {
    if (existingRequest && onDelete) {
      onDelete(existingRequest.id);
      toast.success("Adjustment request deleted");
      onClose();
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <Badge variant="outline" className="bg-vibrant-blue/10 text-vibrant-blue border-vibrant-blue/30">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        );
      case "approved":
        return (
          <Badge variant="outline" className="bg-vibrant-green/10 text-vibrant-green border-vibrant-green/30">
            <CheckCircle className="h-3 w-3 mr-1" />
            Approved
          </Badge>
        );
      case "denied":
        return (
          <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
            <XCircle className="h-3 w-3 mr-1" />
            Denied
          </Badge>
        );
      default:
        return (
          <Badge variant="outline">
            <Clock className="h-3 w-3 mr-1" />
            Unknown
          </Badge>
        );
    }
  };

  const isReadOnly = existingRequest?.status === "approved" || existingRequest?.status === "denied";

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>
              {existingRequest ? "View Adjustment Request" : "Request Attendance Adjustment"}
            </span>
            {existingRequest && getStatusBadge(existingRequest.status)}
          </DialogTitle>
          <DialogDescription>
            {isReadOnly
              ? "View the details of this adjustment request"
              : "Fill in the details to request an attendance adjustment"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="reason" className="flex items-center gap-1">
              Reason <span className="text-destructive">*</span>
            </Label>
            <Select
              value={reason}
              onValueChange={(value: any) => setReason(value)}
              disabled={isReadOnly}
            >
              <SelectTrigger id="reason">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Forgot to Clock-in/Clock-out">
                  Forgot to Clock-in/Clock-out
                </SelectItem>
                <SelectItem value="Missing logs">Missing logs</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Shift Date From/To */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                Shift Date From <span className="text-destructive">*</span>
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !shiftDateFrom && "text-muted-foreground"
                    )}
                    disabled={isReadOnly}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {shiftDateFrom ? format(shiftDateFrom, "MMM dd, yyyy") : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={shiftDateFrom}
                    onSelect={setShiftDateFrom}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                Shift Date To <span className="text-destructive">*</span>
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !shiftDateTo && "text-muted-foreground"
                    )}
                    disabled={isReadOnly}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {shiftDateTo ? format(shiftDateTo, "MMM dd, yyyy") : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={shiftDateTo}
                    onSelect={setShiftDateTo}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Clock In/Out Times */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="clockIn" className="flex items-center gap-1">
                Clock-in Time <span className="text-destructive">*</span>
              </Label>
              <Input
                id="clockIn"
                type="time"
                value={clockInTime}
                onChange={(e) => setClockInTime(e.target.value)}
                disabled={isReadOnly}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="clockOut" className="flex items-center gap-1">
                Clock-out Time <span className="text-destructive">*</span>
              </Label>
              <Input
                id="clockOut"
                type="time"
                value={clockOutTime}
                onChange={(e) => setClockOutTime(e.target.value)}
                disabled={isReadOnly}
              />
            </div>
          </div>

          {/* Break Duration */}
          <div className="space-y-2">
            <Label htmlFor="breakDuration">Break Duration (minutes)</Label>
            <Input
              id="breakDuration"
              type="number"
              value={breakDuration}
              onChange={(e) => setBreakDuration(e.target.value)}
              disabled={isReadOnly}
            />
          </div>

          {/* Total Work Duration */}
          <div className="space-y-2">
            <Label>Total Work Duration</Label>
            <div className="p-3 rounded-md border bg-muted/50 font-medium">
              {calculateWorkDuration()}
            </div>
          </div>

          {/* Message */}
          <div className="space-y-2">
            <Label htmlFor="message" className="flex items-center gap-1">
              Message <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Provide details about your adjustment request..."
              rows={4}
              disabled={isReadOnly}
            />
          </div>

          {/* Attachments */}
          <div className="space-y-2">
            <Label>Attachments (Optional)</Label>
            {attachments.length > 0 && (
              <div className="space-y-2">
                {attachments.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 rounded border bg-muted/50"
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{file}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => toast.success("Downloading " + file)}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      {!isReadOnly && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => handleRemoveAttachment(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!isReadOnly && (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleAddAttachment}
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload Attachment
              </Button>
            )}
          </div>

          {/* Request Logs */}
          {existingRequest && (
            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowLogs(!showLogs)}
              >
                {showLogs ? "Hide" : "View"} Request Logs
              </Button>

              {showLogs && (
                <div className="space-y-3 p-4 rounded-lg border bg-muted/30">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-vibrant-blue/20 flex items-center justify-center">
                      <Clock className="h-4 w-4 text-vibrant-blue" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">Request Submitted</span>
                        {getStatusBadge("pending")}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {existingRequest.submittedDate}
                      </div>
                    </div>
                  </div>

                  {existingRequest.status === "approved" && existingRequest.approvedBy && (
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-vibrant-green/20 flex items-center justify-center">
                        <CheckCircle className="h-4 w-4 text-vibrant-green" />
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">Request Approved</span>
                          {getStatusBadge("approved")}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Approved by {existingRequest.approvedBy}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {existingRequest.approvedDate}
                        </div>
                      </div>
                    </div>
                  )}

                  {existingRequest.status === "denied" && (
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-destructive/20 flex items-center justify-center">
                        <XCircle className="h-4 w-4 text-destructive" />
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">Request Denied</span>
                          {getStatusBadge("denied")}
                        </div>
                        {existingRequest.deniedReason && (
                          <div className="text-sm text-muted-foreground">
                            Reason: {existingRequest.deniedReason}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Warning for approved/denied */}
          {isReadOnly && (
            <div className="flex items-start gap-2 p-3 rounded-lg border bg-muted/50">
              <AlertCircle className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div className="text-sm text-muted-foreground">
                This request has been {existingRequest?.status} and cannot be modified.
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {existingRequest && existingRequest.status === "pending" && onDelete && (
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Request
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            {isReadOnly ? "Close" : "Cancel"}
          </Button>
          {!isReadOnly && (
            <Button onClick={handleSubmit}>
              {existingRequest ? "Update Request" : "Submit Request"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
