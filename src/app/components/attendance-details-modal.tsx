import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Clock, Calendar, FileText, CheckCircle, AlertCircle, Edit, XCircle } from "lucide-react";
import { AttendanceAdjustmentRequest, AttendanceDetails } from "./attendance-details-data";
import { format } from "date-fns";

interface AttendanceDetailsModalProps {
  open: boolean;
  onClose: () => void;
  details: AttendanceDetails | null;
  adjustmentRequest?: (AttendanceAdjustmentRequest & {
    status: "pending" | "approved" | "denied" | "cancelled";
    logTrail?: Array<{
      status: "pending" | "approved" | "denied" | "cancelled";
      date: Date;
      approvedBy?: string;
      reason?: string;
    }>;
  }) | null;
  onRequestAdjustment?: (date: string) => void;
  overtimeRequest?: {
    requestId: string;
    requestDate: string;
    startTime: string;
    endTime: string;
    purpose: string;
    attachments: string[];
    status: "pending" | "approved" | "denied" | "cancelled";
    logs?: Array<{
      logId?: number;
      status: "pending" | "approved" | "denied" | "cancelled";
      loggedAt: string;
      approvedBy?: string | null;
      reason?: string | null;
    }>;
  } | null;
  onRequestOvertime?: (date: string) => void;
}

export function AttendanceDetailsModal({
  open,
  onClose,
  details,
  adjustmentRequest,
  onRequestAdjustment,
  overtimeRequest,
  onRequestOvertime,
}: AttendanceDetailsModalProps) {
  if (!details) return null;

  const parseTimeToMinutes = (value: string | null | undefined) => {
    const text = String(value ?? "").trim();
    if (!/^\d{2}:\d{2}$/.test(text)) {
      return null;
    }

    const [hours, minutes] = text.split(":").map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
      return null;
    }

    return hours * 60 + minutes;
  };

  const formatDuration = (totalMinutes: number | null) => {
    if (totalMinutes == null || totalMinutes <= 0) {
      return "-";
    }

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${minutes}m`;
  };

  const parseOvertimeValuesFromLog = (reason: string | null | undefined) => {
    const text = String(reason ?? "");
    const startTime = text.match(/Start Time:\s*([^\n\r]+)/i)?.[1]?.trim() ?? "";
    const endTime = text.match(/End Time:\s*([^\n\r]+)/i)?.[1]?.trim() ?? "";
    const duration = text.match(/OT Duration:\s*([^\n\r]+)/i)?.[1]?.trim() ?? "";
    const purpose = text.match(/Purpose:\s*([^\n\r]+)/i)?.[1]?.trim() ?? "";
    return { startTime, endTime, duration, purpose };
  };

  const latestOvertimeLogWithValues = (overtimeRequest?.logs ?? [])
    .slice()
    .reverse()
    .find((log) => {
      const parsed = parseOvertimeValuesFromLog(log.reason);
      return Boolean(parsed.startTime || parsed.endTime || parsed.duration || parsed.purpose);
    });

  const parsedOvertimeFallback = parseOvertimeValuesFromLog(latestOvertimeLogWithValues?.reason);
  const displayOvertimeStartTime = overtimeRequest?.startTime?.trim() || parsedOvertimeFallback.startTime || "-";
  const displayOvertimeEndTime = overtimeRequest?.endTime?.trim() || parsedOvertimeFallback.endTime || "-";
  const computedOvertimeDuration = (() => {
    const startMinutes = parseTimeToMinutes(displayOvertimeStartTime);
    const endMinutes = parseTimeToMinutes(displayOvertimeEndTime);
    if (startMinutes == null || endMinutes == null || endMinutes <= startMinutes) {
      return "";
    }
    return formatDuration(endMinutes - startMinutes);
  })();
  const displayOvertimeDuration = computedOvertimeDuration || parsedOvertimeFallback.duration || "-";
  const displayOvertimePurpose = overtimeRequest?.purpose?.trim() || parsedOvertimeFallback.purpose || "-";

  const requestActionLabel = adjustmentRequest
    ? adjustmentRequest.status === "approved"
      ? "View Adjustment Request"
      : "Edit Adjustment Request"
    : "Request Attendance Adjustment";

  const overtimeActionLabel = overtimeRequest
    ? overtimeRequest.status === "approved"
      ? "View Overtime Request"
      : "Edit Overtime Request"
    : "Request Overtime";

  const getAdjustmentStatusBadge = (status: "pending" | "approved" | "denied" | "cancelled") => {
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
            Declined
          </Badge>
        );
      case "cancelled":
        return <Badge variant="outline">Cancelled</Badge>;
    }
  };

  const getRequestStateBadge = (
    label: string,
    status: "pending" | "approved" | "denied" | "cancelled" | null | undefined,
  ) => {
    if (!status) {
      return null;
    }

    const statusLabel = status === "denied" ? "Declined" : status.charAt(0).toUpperCase() + status.slice(1);
    let className = "";
    if (status === "approved") {
      className = "bg-vibrant-green/10 text-vibrant-green border-vibrant-green/30";
    } else if (status === "pending") {
      className = "bg-vibrant-blue/10 text-vibrant-blue border-vibrant-blue/30";
    } else if (status === "denied") {
      className = "bg-destructive/10 text-destructive border-destructive/30";
    }

    return (
      <Badge variant="outline" className={className}>
        {label}: {statusLabel}
      </Badge>
    );
  };

  const renderAdjustmentAction = () => {
    if (!onRequestAdjustment) {
      return null;
    }

    return (
      <div className="pt-4 border-t">
        <Button
          onClick={() => {
            onRequestAdjustment(details.date);
            onClose();
          }}
          className="w-full"
          variant="outline"
        >
          <Edit className="h-4 w-4 mr-2" />
          {requestActionLabel}
        </Button>
      </div>
    );
  };

  const renderOvertimeAction = () => {
    if (!onRequestOvertime || details.status !== "present") {
      return null;
    }

    return (
      <div className="pt-4 border-t">
        <Button
          onClick={() => {
            onRequestOvertime(details.date);
            onClose();
          }}
          className="w-full"
          variant="outline"
        >
          <Edit className="h-4 w-4 mr-2" />
          {overtimeActionLabel}
        </Button>
      </div>
    );
  };

  const renderAdjustmentRequestDetails = () => {
    if (!adjustmentRequest) {
      return null;
    }

    return (
      <div className="space-y-4 pt-4 border-t">
        <div className="flex items-center justify-between gap-2">
          <div className="font-medium">Attendance Adjustment</div>
          {getAdjustmentStatusBadge(adjustmentRequest.status)}
        </div>

        <div className="space-y-1">
          <div className="text-sm text-muted-foreground">Reason</div>
          <div className="font-medium">{adjustmentRequest.reason}</div>
        </div>

        <div className="space-y-1">
          <div className="text-sm text-muted-foreground">Message</div>
          <div className="font-medium whitespace-pre-wrap">{adjustmentRequest.message}</div>
        </div>

        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">Request Logs</div>
          <div className="space-y-2">
            {(adjustmentRequest.logTrail ?? []).length === 0 && (
              <div className="text-sm text-muted-foreground">No request logs yet.</div>
            )}

            {(adjustmentRequest.logTrail ?? []).map((log, index) => (
              <div key={`${log.status}-${index}`} className="rounded-md border bg-muted/30 p-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 h-8 w-8 rounded-full bg-vibrant-blue/15 text-vibrant-blue flex items-center justify-center">
                    <Clock className="h-4 w-4" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="font-medium">{format(log.date, "MMM dd, yyyy hh:mm a")}</div>
                    {log.approvedBy && (
                      <div className="text-sm text-muted-foreground">By: {log.approvedBy}</div>
                    )}
                    {log.reason && (
                      <div className="text-sm text-muted-foreground whitespace-pre-wrap">{log.reason}</div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderOvertimeRequestDetails = () => {
    if (!overtimeRequest) {
      return null;
    }

    return (
      <div className="space-y-4 pt-4 border-t">
        <div className="flex items-center justify-between gap-2">
          <div className="font-medium">Overtime Request</div>
          {getAdjustmentStatusBadge(overtimeRequest.status)}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Request Date</div>
            <div className="font-medium">{format(new Date(overtimeRequest.requestDate), "MMM dd, yyyy")}</div>
          </div>
          <div className="space-y-1" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Start Time</div>
            <div className="font-medium">{displayOvertimeStartTime}</div>
          </div>
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">End Time</div>
            <div className="font-medium">{displayOvertimeEndTime}</div>
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-sm text-muted-foreground">OT Duration</div>
          <div className="font-medium">{displayOvertimeDuration}</div>
        </div>

        <div className="space-y-1">
          <div className="text-sm text-muted-foreground">Purpose</div>
          <div className="font-medium whitespace-pre-wrap">{displayOvertimePurpose}</div>
        </div>

        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">Request Logs</div>
          <div className="space-y-2">
            {(overtimeRequest.logs ?? []).length === 0 && (
              <div className="text-sm text-muted-foreground">No request logs yet.</div>
            )}

            {(overtimeRequest.logs ?? []).map((log, index) => (
              <div key={`${log.status}-${index}`} className="rounded-md border bg-muted/30 p-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 h-8 w-8 rounded-full bg-vibrant-blue/15 text-vibrant-blue flex items-center justify-center">
                    <Clock className="h-4 w-4" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="font-medium">{format(new Date(log.loggedAt), "MMM dd, yyyy hh:mm a")}</div>
                    {log.approvedBy && (
                      <div className="text-sm text-muted-foreground">By: {log.approvedBy}</div>
                    )}
                    {log.reason && (
                      <div className="text-sm text-muted-foreground whitespace-pre-wrap">{log.reason}</div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderPresentDetails = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="text-sm text-muted-foreground">Attendance Source</div>
        <div className="flex flex-wrap gap-2">
          <Badge
            variant="outline"
            className={
              details.effectiveRecordType === "adjusted"
                ? "bg-vibrant-orange/10 text-vibrant-orange border-vibrant-orange/30"
                : "bg-muted"
            }
          >
            {details.effectiveRecordType === "adjusted" ? "Adjusted" : "Actual"}
          </Badge>
          {getRequestStateBadge("Adjustment", details.adjustmentApprovalStatus ?? null)}
          {getRequestStateBadge("Overtime", details.overtimeApprovalStatus ?? null)}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <div className="text-sm text-muted-foreground">Clock-in Time</div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-vibrant-green" />
            <span className="font-medium">{details.clockInTime || "-"}</span>
          </div>
        </div>
        <div className="space-y-1">
          <div className="text-sm text-muted-foreground">Clock-out Time</div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-vibrant-orange" />
            <span className="font-medium">{details.clockOutTime || "-"}</span>
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <div className="text-sm text-muted-foreground">Work Duration</div>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-vibrant-blue" />
          <span className="font-medium">{details.workDuration || "-"}</span>
        </div>
      </div>

      <div className="space-y-1">
        <div className="text-sm text-muted-foreground">Status</div>
        <div>
          {details.lateMinutes && details.lateMinutes > 0 ? (
            <Badge variant="outline" className="bg-vibrant-orange/10 text-vibrant-orange border-vibrant-orange/30">
              <AlertCircle className="h-3 w-3 mr-1" />
              Late by {details.lateMinutes} minutes
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-vibrant-green/10 text-vibrant-green border-vibrant-green/30">
              <CheckCircle className="h-3 w-3 mr-1" />
              On-time
            </Badge>
          )}
        </div>
      </div>

      {renderAdjustmentAction()}
      {renderOvertimeAction()}
    </div>
  );

  const renderAbsentDetails = () => (
    <div className="space-y-4 py-4 text-center">
      <div>
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10 mb-4">
          <AlertCircle className="h-8 w-8 text-destructive" />
        </div>
        <div className="text-lg font-medium mb-2">Absent</div>
        <div className="text-sm text-muted-foreground">
          You were marked absent on this day
        </div>
      </div>

      {renderAdjustmentAction()}
    </div>
  );

  const renderLeaveDetails = () => {
    if (!details.leaveDetails) return null;

    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <div className="text-sm text-muted-foreground">Request Date</div>
          <div className="font-medium">
            {format(new Date(details.leaveDetails.requestDate), "MMM dd, yyyy")}
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-sm text-muted-foreground">Leave Period</div>
          <div className="font-medium">
            {format(new Date(details.leaveDetails.fromDate), "MMM dd, yyyy")} -{" "}
            {format(new Date(details.leaveDetails.toDate), "MMM dd, yyyy")}
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-sm text-muted-foreground">Reason</div>
          <div className="font-medium">{details.leaveDetails.reason}</div>
        </div>

        {details.leaveDetails.attachments.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">Attachments</div>
            <div className="space-y-1">
              {details.leaveDetails.attachments.map((attachment, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 p-2 rounded border bg-muted/50"
                >
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{attachment}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="pt-4 border-t">
          <Badge variant="outline" className="bg-vibrant-green/10 text-vibrant-green border-vibrant-green/30">
            <CheckCircle className="h-3 w-3 mr-1" />
            Approved by {details.leaveDetails.approvedBy}
          </Badge>
          <div className="text-xs text-muted-foreground mt-2">
            {details.leaveDetails.approvedDate}
          </div>
        </div>
      </div>
    );
  };

  const getStatusBadge = () => {
    switch (details.status) {
      case "present":
        return (
          <Badge variant="outline" className="bg-vibrant-green/10 text-vibrant-green border-vibrant-green/30">
            Present
          </Badge>
        );
      case "late":
        return (
          <Badge variant="outline" className="bg-vibrant-orange/10 text-vibrant-orange border-vibrant-orange/30">
            Late
          </Badge>
        );
      case "absent":
        return (
          <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
            Absent
          </Badge>
        );
      case "on-leave":
        return (
          <Badge variant="outline" className="bg-vibrant-purple/10 text-vibrant-purple border-vibrant-purple/30">
            On Leave
          </Badge>
        );
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Attendance Details</span>
            {getStatusBadge()}
          </DialogTitle>
          <DialogDescription>
            {format(new Date(details.date), "EEEE, MMMM dd, yyyy")}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {(details.status === "present" || details.status === "late") && renderPresentDetails()}
          {details.status === "absent" && renderAbsentDetails()}
          {details.status === "on-leave" && renderLeaveDetails()}
          {renderAdjustmentRequestDetails()}
          {renderOvertimeRequestDetails()}
        </div>
      </DialogContent>
    </Dialog>
  );
}
