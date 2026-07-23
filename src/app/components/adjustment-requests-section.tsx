import React, { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  Filter,
  Eye,
  CheckCircle,
  XCircle,
  AlertCircle,
  FileText,
  Download,
  Clock,
  Settings,
} from "lucide-react";
import { toast } from "sonner@2.0.3";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "./ui/alert-dialog";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { format } from "date-fns";
import { getInitialAdjustmentRequests, AdjustmentRequest } from "./adjustment-requests-data";

interface AdjustmentRequestsSectionProps {
  onFilteredCountChange?: (count: number) => void;
  filterStatus?: "all" | "pending" | "approved" | "denied" | "cancelled";
  onFilterStatusChange?: (status: "all" | "pending" | "approved" | "denied" | "cancelled") => void;
}

export function AdjustmentRequestsSection({ 
  onFilteredCountChange,
  filterStatus = "pending",
  onFilterStatusChange
}: AdjustmentRequestsSectionProps) {
  const [adjustmentRequests, setAdjustmentRequests] = useState<AdjustmentRequest[]>(getInitialAdjustmentRequests());
  const adjustmentFilterStatus = filterStatus;
  const [selectedAdjustmentRequest, setSelectedAdjustmentRequest] = useState<AdjustmentRequest | null>(null);
  const [showAdjustmentDetailsDialog, setShowAdjustmentDetailsDialog] = useState(false);
  const [showAdjustmentApproveDialog, setShowAdjustmentApproveDialog] = useState(false);
  const [showAdjustmentDenyDialog, setShowAdjustmentDenyDialog] = useState(false);
  const [showAdjustmentCancelDialog, setShowAdjustmentCancelDialog] = useState(false);
  const [adjustmentDenyReason, setAdjustmentDenyReason] = useState("");
  const [adjustmentCancelReason, setAdjustmentCancelReason] = useState("");

  const filteredAdjustmentRequests = adjustmentRequests.filter(req =>
    adjustmentFilterStatus === "all" ? true : req.status === adjustmentFilterStatus
  ).sort((a, b) => b.submittedDate.getTime() - a.submittedDate.getTime());

  // Notify parent component about filtered count changes
  React.useEffect(() => {
    onFilteredCountChange?.(filteredAdjustmentRequests.length);
  }, [filteredAdjustmentRequests.length, onFilteredCountChange, adjustmentFilterStatus]);

  const handleViewAdjustmentDetails = (request: AdjustmentRequest) => {
    setSelectedAdjustmentRequest(request);
    setShowAdjustmentDetailsDialog(true);
  };

  const handleApproveAdjustment = () => {
    if (!selectedAdjustmentRequest) return;

    setAdjustmentRequests(prev =>
      prev.map(req =>
        req.id === selectedAdjustmentRequest.id
          ? {
              ...req,
              status: "approved" as const,
              logTrail: [
                ...req.logTrail,
                { status: "approved" as const, date: new Date(), approvedBy: "Sarah Martinez" },
              ],
            }
          : req
      )
    );

    toast.success("Adjustment request approved successfully");
    setShowAdjustmentApproveDialog(false);
    setShowAdjustmentDetailsDialog(false);
    setSelectedAdjustmentRequest(null);
  };

  const handleDenyAdjustment = () => {
    if (!selectedAdjustmentRequest) return;

    if (!adjustmentDenyReason.trim()) {
      toast.error("Please provide a reason for denial");
      return;
    }

    setAdjustmentRequests(prev =>
      prev.map(req =>
        req.id === selectedAdjustmentRequest.id
          ? {
              ...req,
              status: "denied" as const,
              logTrail: [
                ...req.logTrail,
                { status: "denied" as const, date: new Date(), approvedBy: "Sarah Martinez", reason: adjustmentDenyReason },
              ],
            }
          : req
      )
    );

    toast.success("Adjustment request denied");
    setShowAdjustmentDenyDialog(false);
    setShowAdjustmentDetailsDialog(false);
    setSelectedAdjustmentRequest(null);
    setAdjustmentDenyReason("");
  };

  const handleCancelApprovedAdjustment = () => {
    if (!selectedAdjustmentRequest) return;

    if (!adjustmentCancelReason.trim()) {
      toast.error("Please provide a reason for cancellation");
      return;
    }

    setAdjustmentRequests(prev =>
      prev.map(req =>
        req.id === selectedAdjustmentRequest.id
          ? {
              ...req,
              status: "cancelled" as const,
              logTrail: [
                ...req.logTrail,
                { 
                  status: "cancelled" as const, 
                  date: new Date(), 
                  reason: adjustmentCancelReason,
                },
              ],
            }
          : req
      )
    );

    toast.success("Adjustment request cancelled");
    setShowAdjustmentCancelDialog(false);
    setShowAdjustmentDetailsDialog(false);
    setSelectedAdjustmentRequest(null);
    setAdjustmentCancelReason("");
  };

  const getAdjustmentStatusBadge = (status: AdjustmentRequest["status"]) => {
    switch (status) {
      case "approved":
        return "bg-vibrant-green/20 text-vibrant-green";
      case "denied":
        return "bg-red-500/20 text-red-600";
      case "pending":
        return "bg-vibrant-orange/20 text-vibrant-orange";
      case "cancelled":
        return "bg-muted-foreground/20 text-muted-foreground";
    }
  };

  return (
    <>
      {/* Filter */}
      <div>
        <label className="text-sm text-muted-foreground mb-2 block flex items-center gap-1">
          <Filter className="h-3 w-3" />
          Filter by Status
        </label>
        <Select value={adjustmentFilterStatus} onValueChange={(value) => onFilterStatusChange?.(value as typeof adjustmentFilterStatus)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Requests</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="denied">Denied</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Requests List */}
      <div className="space-y-2">
        {filteredAdjustmentRequests.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Settings className="h-12 w-12 mx-auto mb-2 opacity-20" />
            <p>No {adjustmentFilterStatus !== "all" ? adjustmentFilterStatus : ""} adjustment requests found</p>
          </div>
        ) : (
          filteredAdjustmentRequests.map((request) => (
            <div
              key={request.id}
              className="flex items-start justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
              onClick={() => handleViewAdjustmentDetails(request)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <p className="font-medium">{request.employeeName}</p>
                  <Badge className={`text-xs ${getAdjustmentStatusBadge(request.status)}`}>
                    {request.status}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{request.reason}</p>
                <p className="text-xs text-muted-foreground">{request.position} • {request.department}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Submitted: {format(request.submittedDate, "MMM dd, yyyy")}
                </p>
              </div>
              <Eye className="h-4 w-4 text-muted-foreground mt-1 flex-shrink-0 ml-2" />
            </div>
          ))
        )}
      </div>

      {/* Adjustment Request Details Dialog */}
      <Dialog open={showAdjustmentDetailsDialog} onOpenChange={setShowAdjustmentDetailsDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Adjustment Request Details</span>
              {selectedAdjustmentRequest && (
                <Badge className={`${getAdjustmentStatusBadge(selectedAdjustmentRequest.status)}`}>
                  {selectedAdjustmentRequest.status}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              {selectedAdjustmentRequest?.reason}
            </DialogDescription>
          </DialogHeader>

          {selectedAdjustmentRequest && (
            <div className="space-y-4">
              {/* Employee Information */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Employee</Label>
                  <div className="p-3 bg-muted rounded-md text-sm">
                    <div className="font-medium">{selectedAdjustmentRequest.employeeName}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {selectedAdjustmentRequest.position} • {selectedAdjustmentRequest.department}
                    </div>
                  </div>
                </div>
                <div>
                  <Label>Request Date</Label>
                  <div className="p-3 bg-muted rounded-md text-sm">
                    {format(selectedAdjustmentRequest.submittedDate, "MMM dd, yyyy")}
                  </div>
                </div>
              </div>

              {/* Shift Date Range */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Shift Date From</Label>
                  <div className="p-3 bg-muted rounded-md text-sm">
                    {format(selectedAdjustmentRequest.shiftDateFrom, "PPP")}
                  </div>
                </div>
                <div>
                  <Label>Shift Date To</Label>
                  <div className="p-3 bg-muted rounded-md text-sm">
                    {format(selectedAdjustmentRequest.shiftDateTo, "PPP")}
                  </div>
                </div>
              </div>

              {/* Clock In/Out Times */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Clock In Time</Label>
                  <div className="p-3 bg-muted rounded-md text-sm">
                    {selectedAdjustmentRequest.clockInTime}
                  </div>
                </div>
                <div>
                  <Label>Clock Out Time</Label>
                  <div className="p-3 bg-muted rounded-md text-sm">
                    {selectedAdjustmentRequest.clockOutTime}
                  </div>
                </div>
              </div>

              {/* Break Duration */}
              <div>
                <Label>Break Duration</Label>
                <div className="p-3 bg-muted rounded-md text-sm">
                  {selectedAdjustmentRequest.breakDuration} minutes
                </div>
              </div>

              {/* Reason */}
              <div>
                <Label>Reason</Label>
                <div className="p-3 bg-muted rounded-md text-sm">
                  {selectedAdjustmentRequest.reason}
                </div>
              </div>

              {/* Message */}
              <div>
                <Label>Message</Label>
                <div className="p-3 bg-muted rounded-md text-sm">
                  {selectedAdjustmentRequest.message}
                </div>
              </div>

              {/* Attachments */}
              {selectedAdjustmentRequest.attachments.length > 0 && (
                <div>
                  <Label>Attachments</Label>
                  <div className="space-y-2 mt-2">
                    {selectedAdjustmentRequest.attachments.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between gap-2 p-2 bg-muted rounded"
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <FileText className="h-4 w-4 text-vibrant-blue flex-shrink-0" />
                          <span className="text-sm truncate">{file}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            toast.success(`Downloading ${file}...`);
                          }}
                          className="h-8 w-8 p-0 flex-shrink-0"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Log Trail */}
              <div>
                <Label className="mb-3 block">Request Log Trail</Label>
                <div className="space-y-3">
                  {selectedAdjustmentRequest.logTrail.map((log, index) => (
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
                        {log.reason && (
                          <p className="text-xs text-muted-foreground mt-1 p-2 bg-muted rounded">
                            Reason: {log.reason}
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
                setShowAdjustmentDetailsDialog(false);
                setSelectedAdjustmentRequest(null);
              }}
            >
              Close
            </Button>
            {selectedAdjustmentRequest?.status === "pending" && (
              <>
                <Button
                  variant="destructive"
                  onClick={() => setShowAdjustmentDenyDialog(true)}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Deny
                </Button>
                <Button
                  className="bg-vibrant-green hover:bg-vibrant-green/90 text-vibrant-green-foreground"
                  onClick={() => setShowAdjustmentApproveDialog(true)}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Approve
                </Button>
              </>
            )}
            {selectedAdjustmentRequest?.status === "approved" && (
              <Button
                variant="destructive"
                onClick={() => setShowAdjustmentCancelDialog(true)}
              >
                <AlertCircle className="h-4 w-4 mr-2" />
                Cancel Request
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve Confirmation Dialog */}
      <AlertDialog open={showAdjustmentApproveDialog} onOpenChange={setShowAdjustmentApproveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve Adjustment Request?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to approve this adjustment request?
            </AlertDialogDescription>
          </AlertDialogHeader>
          {selectedAdjustmentRequest && (
            <div className="px-6 pb-2">
              <div className="p-3 bg-muted rounded-lg text-sm">
                <p className="font-medium text-foreground">
                  {selectedAdjustmentRequest.employeeName} - {selectedAdjustmentRequest.reason}
                </p>
                <p className="text-xs mt-1 text-muted-foreground">
                  {format(selectedAdjustmentRequest.shiftDateFrom, "MMM dd")} -{" "}
                  {format(selectedAdjustmentRequest.shiftDateTo, "MMM dd, yyyy")}
                </p>
              </div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleApproveAdjustment}
              className="bg-vibrant-green text-vibrant-green-foreground hover:bg-vibrant-green/90"
            >
              Yes, Approve
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Deny Dialog */}
      <Dialog open={showAdjustmentDenyDialog} onOpenChange={setShowAdjustmentDenyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deny Adjustment Request</DialogTitle>
            <DialogDescription>
              Please provide a reason for denying this adjustment request. This will be visible to the employee.
            </DialogDescription>
          </DialogHeader>

          {selectedAdjustmentRequest && (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-lg">
                <p className="font-medium">
                  {selectedAdjustmentRequest.employeeName} - {selectedAdjustmentRequest.reason}
                </p>
                <p className="text-sm text-muted-foreground">
                  {format(selectedAdjustmentRequest.shiftDateFrom, "MMM dd")} -{" "}
                  {format(selectedAdjustmentRequest.shiftDateTo, "MMM dd, yyyy")}
                </p>
              </div>

              <div>
                <Label htmlFor="adjustment-deny-reason">Reason for Denial *</Label>
                <Textarea
                  id="adjustment-deny-reason"
                  placeholder="Please provide a detailed reason for denying this request..."
                  rows={4}
                  value={adjustmentDenyReason}
                  onChange={(e) => setAdjustmentDenyReason(e.target.value)}
                  className="mt-2"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAdjustmentDenyDialog(false);
                setAdjustmentDenyReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDenyAdjustment}
            >
              Deny Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Approved Request Dialog */}
      <Dialog open={showAdjustmentCancelDialog} onOpenChange={setShowAdjustmentCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Approved Adjustment Request</DialogTitle>
            <DialogDescription>
              Please provide a reason for cancelling this approved adjustment request.
            </DialogDescription>
          </DialogHeader>

          {selectedAdjustmentRequest && (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-lg">
                <p className="font-medium">
                  {selectedAdjustmentRequest.employeeName} - {selectedAdjustmentRequest.reason}
                </p>
                <p className="text-sm text-muted-foreground">
                  {format(selectedAdjustmentRequest.shiftDateFrom, "MMM dd")} -{" "}
                  {format(selectedAdjustmentRequest.shiftDateTo, "MMM dd, yyyy")}
                </p>
              </div>

              <div>
                <Label htmlFor="adjustment-cancel-reason">Reason for Cancellation *</Label>
                <Textarea
                  id="adjustment-cancel-reason"
                  placeholder="Please provide a detailed reason for cancelling this approved request..."
                  rows={4}
                  value={adjustmentCancelReason}
                  onChange={(e) => setAdjustmentCancelReason(e.target.value)}
                  className="mt-2"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAdjustmentCancelDialog(false);
                setAdjustmentCancelReason("");
              }}
            >
              Close
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancelApprovedAdjustment}
            >
              Cancel Adjustment Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
