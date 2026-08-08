import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from './ui/select'
import {
    Filter,
    Eye,
    AlertCircle,
    FileText,
    Download,
    Clock,
    CheckCircle,
    XCircle,
    Settings,
} from 'lucide-react'
import { toast } from 'sonner'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from './ui/dialog'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from './ui/alert-dialog'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { format } from 'date-fns'
import { AdjustmentRequest } from './adjustment-requests-data'

interface AdjustmentRequestApiLog {
    status: 'pending' | 'approved' | 'denied' | 'cancelled'
    loggedAt: string
    approvedBy?: string | null
    reason?: string | null
}

interface AdjustmentRequestApiAttachment {
    fileName: string
}

interface AdjustmentRequestApiRow {
    request_id: string
    employee_id: string
    employee_name: string
    position: string
    department: string
    shift_date_from: string
    shift_date_to: string
    clock_in_time: string
    clock_out_time: string
    reason: 'Forgot to Clock-in/Clock-out' | 'Missing logs'
    break_duration_minutes: number
    message: string
    status: 'pending' | 'approved' | 'denied' | 'cancelled'
    submitted_at: string
    attachments?: AdjustmentRequestApiAttachment[]
    logs?: AdjustmentRequestApiLog[]
}

interface AdjustmentRequestsSectionProps {
    apiBaseUrl: string
    accessToken: string
    requestKind?: 'adjustment' | 'overtime'
    onFilteredCountChange?: (count: number) => void
    filterStatus?: 'all' | 'pending' | 'approved' | 'denied' | 'cancelled'
    onFilterStatusChange?: (
        status: 'all' | 'pending' | 'approved' | 'denied' | 'cancelled'
    ) => void
}

export function AdjustmentRequestsSection({
    apiBaseUrl,
    accessToken,
    requestKind = 'adjustment',
    onFilteredCountChange,
    filterStatus = 'pending',
    onFilterStatusChange,
}: AdjustmentRequestsSectionProps) {
    const [adjustmentRequests, setAdjustmentRequests] = useState<
        AdjustmentRequest[]
    >([])
    const [isLoadingAdjustmentRequests, setIsLoadingAdjustmentRequests] =
        useState(false)
    const adjustmentFilterStatus = filterStatus
    const [selectedAdjustmentRequest, setSelectedAdjustmentRequest] =
        useState<AdjustmentRequest | null>(null)
    const [showAdjustmentDetailsDialog, setShowAdjustmentDetailsDialog] =
        useState(false)
    const [showAdjustmentApproveDialog, setShowAdjustmentApproveDialog] =
        useState(false)
    const [showAdjustmentDenyDialog, setShowAdjustmentDenyDialog] =
        useState(false)
    const [showAdjustmentCancelDialog, setShowAdjustmentCancelDialog] =
        useState(false)
    const [adjustmentDenyReason, setAdjustmentDenyReason] = useState('')
    const [adjustmentCancelReason, setAdjustmentCancelReason] = useState('')
    const [isSubmittingAction, setIsSubmittingAction] = useState(false)
    const requestLabel =
        requestKind === 'overtime' ? 'overtime request' : 'adjustment request'
    const requestLabelTitle =
        requestKind === 'overtime' ? 'Overtime Request' : 'Adjustment Request'
    const requestEndpointBase = `${apiBaseUrl}/hr/${requestKind}-requests`
    const requestActionEndpointBase = `${apiBaseUrl}/hr/adjustment-requests`

    const toSafeDate = (value: unknown, fallbackDate?: Date) => {
        if (typeof value !== 'string') {
            return fallbackDate ?? new Date()
        }

        const parsed = new Date(value)
        if (Number.isNaN(parsed.getTime())) {
            return fallbackDate ?? new Date()
        }

        return parsed
    }

    const loadAdjustmentRequests = React.useCallback(async () => {
        if (!accessToken) {
            return
        }

        setIsLoadingAdjustmentRequests(true)
        try {
            const response = await fetch(`${requestEndpointBase}?sourcePage=all`, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            })

            const body = await response.json().catch(() => null)
            if (!response.ok) {
                throw new Error(body?.error ?? `Failed to load ${requestLabel}s`)
            }

            const rows = Array.isArray(body?.requests)
                ? (body.requests as AdjustmentRequestApiRow[])
                : []

            const mapped = rows.map(row => {
                const submittedDate = toSafeDate(row.submitted_at)
                const shiftDateFrom = toSafeDate(
                    row.shift_date_from,
                    submittedDate
                )
                const shiftDateTo = toSafeDate(row.shift_date_to, shiftDateFrom)

                return {
                    id: String(row.request_id),
                    employeeId: String(row.employee_id ?? ''),
                    employeeName: String(row.employee_name ?? ''),
                    position: String(row.position ?? ''),
                    department: String(row.department ?? ''),
                    shiftDateFrom,
                    shiftDateTo,
                    clockInTime: String(row.clock_in_time ?? ''),
                    clockOutTime: String(row.clock_out_time ?? ''),
                    reason: row.reason,
                    breakDuration: Number(row.break_duration_minutes ?? 0),
                    message: String(row.message ?? ''),
                    status: row.status,
                    submittedDate,
                    attachments: Array.isArray(row.attachments)
                        ? row.attachments
                              .map(item => String(item?.fileName ?? ''))
                              .filter(Boolean)
                        : [],
                    logTrail: Array.isArray(row.logs)
                        ? row.logs.map(log => ({
                              status: log.status,
                              date: toSafeDate(log.loggedAt, submittedDate),
                              approvedBy: log.approvedBy ?? undefined,
                              reason: log.reason ?? undefined,
                          }))
                        : [],
                } as AdjustmentRequest
            })

            setAdjustmentRequests(mapped)
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : `Failed to load ${requestLabel}s`
            toast.error(message)
            setAdjustmentRequests([])
        } finally {
            setIsLoadingAdjustmentRequests(false)
        }
    }, [accessToken, requestEndpointBase, requestLabel])

    React.useEffect(() => {
        loadAdjustmentRequests()
    }, [loadAdjustmentRequests])

    const filteredAdjustmentRequests = adjustmentRequests
        .filter(req =>
            adjustmentFilterStatus === 'all'
                ? true
                : req.status === adjustmentFilterStatus
        )
        .sort((a, b) => b.submittedDate.getTime() - a.submittedDate.getTime())

    // Notify parent component about filtered count changes
    React.useEffect(() => {
        onFilteredCountChange?.(filteredAdjustmentRequests.length)
    }, [
        filteredAdjustmentRequests.length,
        onFilteredCountChange,
        adjustmentFilterStatus,
    ])

    const handleViewAdjustmentDetails = (request: AdjustmentRequest) => {
        setSelectedAdjustmentRequest(request)
        setShowAdjustmentDetailsDialog(true)
    }

    const isMissingAdjustmentRequestError = (message: string) =>
        /no existing request|request not found|adjustment request not found/i.test(
            message
        )

    const handleApproveAdjustment = async () => {
        if (!selectedAdjustmentRequest) return

        setIsSubmittingAction(true)
        try {
            const response = await fetch(
                `${requestActionEndpointBase}/${selectedAdjustmentRequest.id}/approve`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                }
            )

            const body = await response.json().catch(() => null)
            if (!response.ok) {
                throw new Error(body?.error ?? `Failed to approve ${requestLabel}`)
            }

            await loadAdjustmentRequests()
            toast.success(`${requestLabelTitle} approved successfully`)
            setShowAdjustmentApproveDialog(false)
            setShowAdjustmentDetailsDialog(false)
            setSelectedAdjustmentRequest(null)
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : `Failed to approve ${requestLabel}`
            if (isMissingAdjustmentRequestError(message)) {
                await loadAdjustmentRequests()
                setShowAdjustmentApproveDialog(false)
                setShowAdjustmentDetailsDialog(false)
                setSelectedAdjustmentRequest(null)
                return
            }
            toast.error(message)
        } finally {
            setIsSubmittingAction(false)
        }
    }

    const handleDenyAdjustment = async () => {
        if (!selectedAdjustmentRequest) return
        if (!adjustmentDenyReason.trim()) {
            toast.error('Please provide a reason for denial')
            return
        }

        setIsSubmittingAction(true)
        try {
            const response = await fetch(
                `${requestActionEndpointBase}/${selectedAdjustmentRequest.id}/deny`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        reason: adjustmentDenyReason.trim(),
                    }),
                }
            )

            const body = await response.json().catch(() => null)
            if (!response.ok) {
                throw new Error(body?.error ?? `Failed to deny ${requestLabel}`)
            }

            await loadAdjustmentRequests()
            toast.success(`${requestLabelTitle} denied`)
            setShowAdjustmentDenyDialog(false)
            setShowAdjustmentDetailsDialog(false)
            setSelectedAdjustmentRequest(null)
            setAdjustmentDenyReason('')
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : `Failed to deny ${requestLabel}`
            if (isMissingAdjustmentRequestError(message)) {
                await loadAdjustmentRequests()
                setShowAdjustmentDenyDialog(false)
                setShowAdjustmentDetailsDialog(false)
                setSelectedAdjustmentRequest(null)
                setAdjustmentDenyReason('')
                return
            }
            toast.error(message)
        } finally {
            setIsSubmittingAction(false)
        }
    }

    const handleCancelApprovedAdjustment = async () => {
        if (!selectedAdjustmentRequest) return
        if (!adjustmentCancelReason.trim()) {
            toast.error('Please provide a reason for cancellation')
            return
        }

        setIsSubmittingAction(true)
        try {
            const response = await fetch(
                `${requestActionEndpointBase}/${selectedAdjustmentRequest.id}/cancel`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        reason: adjustmentCancelReason.trim(),
                    }),
                }
            )

            const body = await response.json().catch(() => null)
            if (!response.ok) {
                throw new Error(body?.error ?? `Failed to cancel ${requestLabel}`)
            }

            await loadAdjustmentRequests()
            toast.success(`${requestLabelTitle} cancelled`)
            setShowAdjustmentCancelDialog(false)
            setShowAdjustmentDetailsDialog(false)
            setSelectedAdjustmentRequest(null)
            setAdjustmentCancelReason('')
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : `Failed to cancel ${requestLabel}`
            if (isMissingAdjustmentRequestError(message)) {
                await loadAdjustmentRequests()
                setShowAdjustmentCancelDialog(false)
                setShowAdjustmentDetailsDialog(false)
                setSelectedAdjustmentRequest(null)
                setAdjustmentCancelReason('')
                return
            }
            toast.error(message)
        } finally {
            setIsSubmittingAction(false)
        }
    }

    const getAdjustmentStatusBadge = (status: AdjustmentRequest['status']) => {
        switch (status) {
            case 'approved':
                return 'bg-vibrant-green/20 text-vibrant-green'
            case 'denied':
                return 'bg-red-500/20 text-red-600'
            case 'pending':
                return 'bg-vibrant-orange/20 text-vibrant-orange'
            case 'cancelled':
                return 'bg-muted-foreground/20 text-muted-foreground'
        }
    }

    return (
        <>
            {/* Filter */}
            <div>
                <label className="text-sm text-muted-foreground mb-2 block flex items-center gap-1">
                    <Filter className="h-3 w-3" />
                    Filter by Status
                </label>
                <Select
                    value={adjustmentFilterStatus}
                    onValueChange={value =>
                        onFilterStatusChange?.(
                            value as typeof adjustmentFilterStatus
                        )
                    }
                >
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
                {isLoadingAdjustmentRequests ? (
                    <div className="text-center py-8 text-muted-foreground">
                        <Settings className="h-12 w-12 mx-auto mb-2 opacity-20" />
                        <p>{`Loading ${requestLabel}s...`}</p>
                    </div>
                ) : filteredAdjustmentRequests.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                        <Settings className="h-12 w-12 mx-auto mb-2 opacity-20" />
                        <p>
                            No{' '}
                            {adjustmentFilterStatus !== 'all'
                                ? adjustmentFilterStatus
                                : ''}{' '}
                            {requestLabel}s found
                        </p>
                    </div>
                ) : (
                    filteredAdjustmentRequests.map(request => (
                        <div
                            key={request.id}
                            className="flex items-start justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
                            onClick={() => handleViewAdjustmentDetails(request)}
                        >
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    <p className="font-medium">
                                        {request.employeeName}
                                    </p>
                                    <Badge
                                        className={`text-xs ${getAdjustmentStatusBadge(request.status)}`}
                                    >
                                        {request.status}
                                    </Badge>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    {request.reason}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {request.position} | {request.department}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Submitted:{' '}
                                    {format(
                                        request.submittedDate,
                                        'MMM dd, yyyy'
                                    )}
                                </p>
                            </div>
                            <Eye className="h-4 w-4 text-muted-foreground mt-1 flex-shrink-0 ml-2" />
                        </div>
                    ))
                )}
            </div>

            {/* Adjustment Request Details Dialog */}
            <Dialog
                open={showAdjustmentDetailsDialog}
                onOpenChange={setShowAdjustmentDetailsDialog}
            >
                <DialogContent className="max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center justify-between">
                            <span>{requestLabelTitle} Details</span>
                            {selectedAdjustmentRequest && (
                                <Badge
                                    className={`${getAdjustmentStatusBadge(selectedAdjustmentRequest.status)}`}
                                >
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
                                        <div className="font-medium">
                                            {
                                                selectedAdjustmentRequest.employeeName
                                            }
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-1">
                                            {selectedAdjustmentRequest.position}{' '}
                                            |{' '}
                                            {
                                                selectedAdjustmentRequest.department
                                            }
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <Label>Request Date</Label>
                                    <div className="p-3 bg-muted rounded-md text-sm">
                                        {format(
                                            selectedAdjustmentRequest.submittedDate,
                                            'MMM dd, yyyy'
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Shift Date Range */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label>Shift Date From</Label>
                                    <div className="p-3 bg-muted rounded-md text-sm">
                                        {format(
                                            selectedAdjustmentRequest.shiftDateFrom,
                                            'PPP'
                                        )}
                                    </div>
                                </div>
                                <div>
                                    <Label>Shift Date To</Label>
                                    <div className="p-3 bg-muted rounded-md text-sm">
                                        {format(
                                            selectedAdjustmentRequest.shiftDateTo,
                                            'PPP'
                                        )}
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
                                    {selectedAdjustmentRequest.breakDuration}{' '}
                                    minutes
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
                            {selectedAdjustmentRequest.attachments.length >
                                0 && (
                                <div>
                                    <Label>Attachments</Label>
                                    <div className="space-y-2 mt-2">
                                        {selectedAdjustmentRequest.attachments.map(
                                            (file, index) => (
                                                <div
                                                    key={index}
                                                    className="flex items-center justify-between gap-2 p-2 bg-muted rounded"
                                                >
                                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                                        <FileText className="h-4 w-4 text-vibrant-blue flex-shrink-0" />
                                                        <span className="text-sm truncate">
                                                            {file}
                                                        </span>
                                                    </div>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => {
                                                            toast.success(
                                                                `Downloading ${file}...`
                                                            )
                                                        }}
                                                        className="h-8 w-8 p-0 flex-shrink-0"
                                                    >
                                                        <Download className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            )
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Log Trail */}
                            <div>
                                <Label className="mb-3 block">
                                    Request Log Trail
                                </Label>
                                <div className="space-y-3">
                                    {selectedAdjustmentRequest.logTrail.map(
                                        (log, index) => (
                                            <div
                                                key={index}
                                                className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg"
                                            >
                                                <div className="mt-1">
                                                    {log.status ===
                                                        'pending' && (
                                                        <Clock className="h-5 w-5 text-vibrant-orange" />
                                                    )}
                                                    {log.status ===
                                                        'approved' && (
                                                        <CheckCircle className="h-5 w-5 text-vibrant-green" />
                                                    )}
                                                    {log.status ===
                                                        'denied' && (
                                                        <XCircle className="h-5 w-5 text-red-600" />
                                                    )}
                                                    {log.status ===
                                                        'cancelled' && (
                                                        <AlertCircle className="h-5 w-5 text-muted-foreground" />
                                                    )}
                                                </div>
                                                <div className="flex-1">
                                                    <div className="flex items-center justify-between">
                                                        <p className="text-sm font-medium capitalize">
                                                            {log.status}
                                                        </p>
                                                        <p className="text-xs text-muted-foreground">
                                                            {format(
                                                                log.date,
                                                                "MMM dd, yyyy 'at' h:mm a"
                                                            )}
                                                        </p>
                                                    </div>
                                                    {log.approvedBy && (
                                                        <p className="text-xs text-muted-foreground mt-1">
                                                            By: {log.approvedBy}
                                                        </p>
                                                    )}
                                                    {log.reason && (
                                                        <p className="text-xs text-muted-foreground mt-1 p-2 bg-muted rounded">
                                                            Reason: {log.reason}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setShowAdjustmentDetailsDialog(false)
                                setSelectedAdjustmentRequest(null)
                            }}
                        >
                            Close
                        </Button>
                        {selectedAdjustmentRequest?.status === 'pending' && (
                            <>
                                <Button
                                    variant="destructive"
                                    onClick={() =>
                                        setShowAdjustmentDenyDialog(true)
                                    }
                                >
                                    <XCircle className="h-4 w-4 mr-2" />
                                    Deny
                                </Button>
                                <Button
                                    className="bg-vibrant-green hover:bg-vibrant-green/90 text-vibrant-green-foreground"
                                    onClick={() =>
                                        setShowAdjustmentApproveDialog(true)
                                    }
                                >
                                    <CheckCircle className="h-4 w-4 mr-2" />
                                    Approve
                                </Button>
                            </>
                        )}
                        {selectedAdjustmentRequest?.status === 'approved' && (
                            <Button
                                variant="destructive"
                                onClick={() =>
                                    setShowAdjustmentCancelDialog(true)
                                }
                            >
                                <AlertCircle className="h-4 w-4 mr-2" />
                                Cancel Request
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog
                open={showAdjustmentApproveDialog}
                onOpenChange={setShowAdjustmentApproveDialog}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {`Approve ${requestLabelTitle}?`}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {`Are you sure you want to approve this ${requestLabel}?`}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isSubmittingAction}>
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleApproveAdjustment}
                            disabled={isSubmittingAction}
                            className="bg-vibrant-green text-vibrant-green-foreground hover:bg-vibrant-green/90"
                        >
                            Yes, Approve
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Dialog
                open={showAdjustmentDenyDialog}
                onOpenChange={setShowAdjustmentDenyDialog}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{`Deny ${requestLabelTitle}`}</DialogTitle>
                        <DialogDescription>
                            {`Please provide a reason for denying this ${requestLabel}.`}
                        </DialogDescription>
                    </DialogHeader>
                    <div>
                        <Label htmlFor="adjustment-deny-reason">
                            Reason for Denial *
                        </Label>
                        <Textarea
                            id="adjustment-deny-reason"
                            placeholder="Please provide a detailed reason for denying this request..."
                            rows={4}
                            value={adjustmentDenyReason}
                            onChange={e =>
                                setAdjustmentDenyReason(e.target.value)
                            }
                            className="mt-2"
                        />
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            disabled={isSubmittingAction}
                            onClick={() => {
                                setShowAdjustmentDenyDialog(false)
                                setAdjustmentDenyReason('')
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            disabled={isSubmittingAction}
                            onClick={handleDenyAdjustment}
                        >
                            Deny Request
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog
                open={showAdjustmentCancelDialog}
                onOpenChange={setShowAdjustmentCancelDialog}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {`Cancel Approved ${requestLabelTitle}`}
                        </DialogTitle>
                        <DialogDescription>
                            {`Please provide a reason for cancelling this approved ${requestLabel}.`}
                        </DialogDescription>
                    </DialogHeader>
                    <div>
                        <Label htmlFor="adjustment-cancel-reason">
                            Reason for Cancellation *
                        </Label>
                        <Textarea
                            id="adjustment-cancel-reason"
                            placeholder="Please provide a detailed reason for cancelling this approved request..."
                            rows={4}
                            value={adjustmentCancelReason}
                            onChange={e =>
                                setAdjustmentCancelReason(e.target.value)
                            }
                            className="mt-2"
                        />
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            disabled={isSubmittingAction}
                            onClick={() => {
                                setShowAdjustmentCancelDialog(false)
                                setAdjustmentCancelReason('')
                            }}
                        >
                            Close
                        </Button>
                        <Button
                            variant="destructive"
                            disabled={isSubmittingAction}
                            onClick={handleCancelApprovedAdjustment}
                        >
                            {`Cancel ${requestLabelTitle}`}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
