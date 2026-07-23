import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Clock, Calendar, FileText, CheckCircle, AlertCircle, Edit } from "lucide-react";
import { AttendanceDetails } from "./attendance-details-data";
import { format } from "date-fns";

interface AttendanceDetailsModalProps {
  open: boolean;
  onClose: () => void;
  details: AttendanceDetails | null;
  onRequestAdjustment?: (date: string) => void;
}

export function AttendanceDetailsModal({
  open,
  onClose,
  details,
  onRequestAdjustment,
}: AttendanceDetailsModalProps) {
  if (!details) return null;

  const renderPresentDetails = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <div className="text-sm text-muted-foreground">Clock-in Time</div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-vibrant-green" />
            <span className="font-medium">{details.clockInTime}</span>
          </div>
        </div>
        <div className="space-y-1">
          <div className="text-sm text-muted-foreground">Clock-out Time</div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-vibrant-orange" />
            <span className="font-medium">{details.clockOutTime}</span>
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <div className="text-sm text-muted-foreground">Work Duration</div>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-vibrant-blue" />
          <span className="font-medium">{details.workDuration}</span>
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

      {onRequestAdjustment && (
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
            Request Attendance Adjustment
          </Button>
        </div>
      )}
    </div>
  );

  const renderAbsentDetails = () => (
    <div className="py-8 text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10 mb-4">
        <AlertCircle className="h-8 w-8 text-destructive" />
      </div>
      <div className="text-lg font-medium mb-2">Absent</div>
      <div className="text-sm text-muted-foreground">
        You were marked absent on this day
      </div>
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
        return (
          <Badge variant="outline">
            Unknown
          </Badge>
        );
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
