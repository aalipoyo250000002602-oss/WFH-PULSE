import { useState, useEffect, useRef, type ChangeEvent } from 'react'
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from './ui/select'
import { Badge } from './ui/badge'
import { Calendar } from './ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
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
} from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { AttendanceAdjustmentRequest } from './attendance-details-data'
import { cn } from './ui/utils'

interface AttendanceAdjustmentModalProps {
	open: boolean
	onClose: () => void
	selectedDate: string | null
	existingRequest?:
		| (AttendanceAdjustmentRequest & {
				status: 'pending' | 'approved' | 'denied' | 'cancelled'
				logTrail?: Array<{
					status: 'pending' | 'approved' | 'denied' | 'cancelled'
					date: Date
					approvedBy?: string
					reason?: string
				}>
		  })
		| null
	prefilledTimes?: { clockIn: string; clockOut: string } | null
	onSubmit: (
		request: Omit<AttendanceAdjustmentRequest, 'id' | 'submittedDate'>
	) => Promise<boolean>
	onDelete?: (requestId: string) => Promise<boolean>
	onRevoke?: (requestId: string) => Promise<boolean>
	isLoading?: boolean
}

export function AttendanceAdjustmentModal({
	open,
	onClose,
	selectedDate,
	existingRequest,
	prefilledTimes,
	onSubmit,
	onDelete,
	onRevoke,
	isLoading = false,
}: AttendanceAdjustmentModalProps) {
	const [reason, setReason] = useState<
		'Forgot to Clock-in/Clock-out' | 'Missing logs'
	>('Forgot to Clock-in/Clock-out')
	const [shiftDateFrom, setShiftDateFrom] = useState<Date | undefined>(
		undefined
	)
	const [shiftDateTo, setShiftDateTo] = useState<Date | undefined>(undefined)
	const [clockInTime, setClockInTime] = useState('')
	const [clockOutTime, setClockOutTime] = useState('')
	const [breakDuration, setBreakDuration] = useState('60')
	const [message, setMessage] = useState('')
	const [attachments, setAttachments] = useState<string[]>([])
	const [showLogs, setShowLogs] = useState(false)
	const [isSubmitting, setIsSubmitting] = useState(false)
	const fileInputRef = useRef<HTMLInputElement | null>(null)
	const [durationValidationMessage, setDurationValidationMessage] =
		useState('')

	// Initialize form with existing request or selected date
	useEffect(() => {
		if (open) {
			if (existingRequest) {
				setReason(existingRequest.reason)
				setShiftDateFrom(new Date(existingRequest.shiftDateFrom))
				setShiftDateTo(new Date(existingRequest.shiftDateTo))
				setClockInTime(existingRequest.clockInTime)
				setClockOutTime(existingRequest.clockOutTime)
				setBreakDuration(existingRequest.breakDuration.toString())
				setMessage(existingRequest.message)
				setAttachments(existingRequest.attachments)
			} else if (selectedDate) {
				setShiftDateFrom(new Date(selectedDate))
				setShiftDateTo(new Date(selectedDate))
				setReason('Forgot to Clock-in/Clock-out')
				setClockInTime(prefilledTimes?.clockIn || '09:00')
				setClockOutTime(prefilledTimes?.clockOut || '18:00')
				setBreakDuration('60')
				setMessage('')
				setAttachments([])
			}
		}
	}, [open, selectedDate, existingRequest, prefilledTimes])

	const calculateWorkDuration = () => {
		if (!clockInTime || !clockOutTime) return '0h 0m'

		const [inHour, inMin] = clockInTime.split(':').map(Number)
		const [outHour, outMin] = clockOutTime.split(':').map(Number)

		const totalMinutes =
			outHour * 60 +
			outMin -
			(inHour * 60 + inMin) -
			Number(breakDuration)
		if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) {
			return '0h 0m'
		}

		const hours = Math.floor(totalMinutes / 60)
		const minutes = totalMinutes % 60

		return `${hours}h ${minutes}m`
	}

	const validateDurationForValues = (
		nextClockIn: string,
		nextClockOut: string,
		nextBreak: string
	) => {
		if (!nextClockIn || !nextClockOut) {
			setDurationValidationMessage('')
			return true
		}

		const [inHour, inMin] = nextClockIn.split(':').map(Number)
		const [outHour, outMin] = nextClockOut.split(':').map(Number)
		if (
			Number.isNaN(inHour) ||
			Number.isNaN(inMin) ||
			Number.isNaN(outHour) ||
			Number.isNaN(outMin)
		) {
			setDurationValidationMessage('Invalid time format.')
			return false
		}

		const breakMinutes = Number(nextBreak)
		if (
			!Number.isFinite(breakMinutes) ||
			breakMinutes < 0 ||
			breakMinutes > 360
		) {
			setDurationValidationMessage(
				'Break duration must be between 0 and 360 minutes.'
			)
			return false
		}

		const total =
			outHour * 60 + outMin - (inHour * 60 + inMin) - breakMinutes
		if (total <= 0) {
			setDurationValidationMessage(
				'Clock-in, clock-out, and break values produce non-positive work duration.'
			)
			return false
		}

		setDurationValidationMessage('')
		return true
	}

	useEffect(() => {
		void validateDurationForValues(clockInTime, clockOutTime, breakDuration)
	}, [clockInTime, clockOutTime, breakDuration])

	const handleClockInTimeChange = (value: string) => {
		setClockInTime(value)
	}

	const handleClockOutTimeChange = (value: string) => {
		setClockOutTime(value)
	}

	const handleBreakDurationChange = (value: string) => {
		setBreakDuration(value)
	}

	const computeTotalMinutes = () => {
		if (!clockInTime || !clockOutTime) {
			return null
		}

		const [inHour, inMin] = clockInTime.split(':').map(Number)
		const [outHour, outMin] = clockOutTime.split(':').map(Number)
		if (
			Number.isNaN(inHour) ||
			Number.isNaN(inMin) ||
			Number.isNaN(outHour) ||
			Number.isNaN(outMin)
		) {
			return null
		}

		const total =
			outHour * 60 +
			outMin -
			(inHour * 60 + inMin) -
			Number(breakDuration)
		return total
	}

	const handleSubmit = async () => {
		// Validation
		if (!reason) {
			toast.error('Please select a reason')
			return
		}
		if (!shiftDateFrom || !shiftDateTo) {
			toast.error('Please select shift dates')
			return
		}
		if (!clockInTime || !clockOutTime) {
			toast.error('Please enter clock-in and clock-out times')
			return
		}

		if (shiftDateFrom > shiftDateTo) {
			toast.error('Shift Date From must not be later than Shift Date To')
			return
		}

		const breakMinutes = Number(breakDuration)
		if (
			!Number.isFinite(breakMinutes) ||
			breakMinutes < 0 ||
			breakMinutes > 360
		) {
			toast.error('Break duration must be between 0 and 360 minutes')
			return
		}

		const totalMinutes = computeTotalMinutes()
		if (totalMinutes == null || totalMinutes <= 0) {
			toast.error(
				'Clock-out time must be after clock-in time after deducting break duration'
			)
			return
		}

		if (attachments.length > 10) {
			toast.error('You can upload at most 10 attachments')
			return
		}

		const trimmedMessage = message.trim()
		if (!trimmedMessage) {
			toast.error('Please enter a message')
			return
		}

		if (trimmedMessage.length < 3) {
			toast.error('Message must contain at least 3 characters')
			return
		}

		const request: Omit<
			AttendanceAdjustmentRequest,
			'id' | 'submittedDate'
		> = {
			date: selectedDate || format(shiftDateFrom, 'yyyy-MM-dd'),
			reason,
			shiftDateFrom: format(shiftDateFrom, 'yyyy-MM-dd'),
			shiftDateTo: format(shiftDateTo, 'yyyy-MM-dd'),
			clockInTime,
			clockOutTime,
			breakDuration: breakMinutes,
			totalWorkDuration: calculateWorkDuration(),
			message: trimmedMessage,
			attachments,
			status: existingRequest?.status || 'pending',
			approvedBy: existingRequest?.approvedBy,
			approvedDate: existingRequest?.approvedDate,
			deniedReason: existingRequest?.deniedReason,
		}

		setIsSubmitting(true)
		const saved = await onSubmit(request)
		setIsSubmitting(false)

		if (saved) {
			toast.success(
				existingRequest
					? 'Adjustment request updated successfully'
					: 'Adjustment request submitted successfully'
			)
			onClose()
		}
	}

	const handleAddAttachment = () => {
		fileInputRef.current?.click()
	}

	const handleFilePicked = (event: ChangeEvent<HTMLInputElement>) => {
		const files = Array.from(event.target.files ?? [])
		if (files.length === 0) {
			return
		}

		const next = [...attachments]
		for (const file of files) {
			if (!next.includes(file.name)) {
				next.push(file.name)
			}
		}

		setAttachments(next)
		event.target.value = ''
		toast.success('Attachment list updated')
	}

	const handleRemoveAttachment = (index: number) => {
		setAttachments(attachments.filter((_, i) => i !== index))
		toast.success('Attachment removed')
	}

	const handleDelete = async () => {
		if (existingRequest && onDelete) {
			setIsSubmitting(true)
			const deleted = await onDelete(existingRequest.id)
			setIsSubmitting(false)
			if (deleted) {
				toast.success('Adjustment request deleted')
				onClose()
			}
		}
	}

	const handleRevoke = async () => {
		if (existingRequest && onRevoke) {
			setIsSubmitting(true)
			const revoked = await onRevoke(existingRequest.id)
			setIsSubmitting(false)
			if (revoked) {
				toast.success(
					'Approved request has been revoked and reset to pending'
				)
				onClose()
			}
		}
	}

	const getStatusBadge = (status: string) => {
		switch (status) {
			case 'pending':
				return (
					<Badge
						variant="outline"
						className="bg-vibrant-blue/10 text-vibrant-blue border-vibrant-blue/30"
					>
						<Clock className="h-3 w-3 mr-1" />
						Pending
					</Badge>
				)
			case 'approved':
				return (
					<Badge
						variant="outline"
						className="bg-vibrant-green/10 text-vibrant-green border-vibrant-green/30"
					>
						<CheckCircle className="h-3 w-3 mr-1" />
						Approved
					</Badge>
				)
			case 'denied':
				return (
					<Badge
						variant="outline"
						className="bg-destructive/10 text-destructive border-destructive/30"
					>
						<XCircle className="h-3 w-3 mr-1" />
						Denied
					</Badge>
				)
			default:
				return (
					<Badge variant="outline">
						<Clock className="h-3 w-3 mr-1" />
						Unknown
					</Badge>
				)
		}
	}

	const isReadOnly = existingRequest?.status === 'approved'
	const hasBusyState = isSubmitting || isLoading
	const areShiftDatesLocked = true

	return (
		<Dialog open={open} onOpenChange={onClose}>
			<DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="flex items-center justify-between">
						<span>
							{existingRequest
								? 'View Adjustment Request'
								: 'Request Attendance Adjustment'}
						</span>
						{existingRequest &&
							getStatusBadge(existingRequest.status)}
					</DialogTitle>
					<DialogDescription>
						{isReadOnly
							? 'View the details of this adjustment request'
							: 'Fill in the details to request an attendance adjustment'}
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-4">
					{!isReadOnly && (
						<div className="flex items-start gap-2 p-3 rounded-lg border bg-muted/50">
							<AlertCircle className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
							<div className="text-sm text-muted-foreground">
								Pending request only. Attendance record remains
								unchanged until approval.
							</div>
						</div>
					)}

					{/* Reason */}
					<div className="space-y-2">
						<Label
							htmlFor="reason"
							className="flex items-center gap-1"
						>
							Reason <span className="text-destructive">*</span>
						</Label>
						<Select
							value={reason}
							onValueChange={(value: any) => setReason(value)}
							disabled={isReadOnly || hasBusyState}
						>
							<SelectTrigger id="reason">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="Forgot to Clock-in/Clock-out">
									Forgot to Clock-in/Clock-out
								</SelectItem>
								<SelectItem value="Missing logs">
									Missing logs
								</SelectItem>
							</SelectContent>
						</Select>
					</div>

					{/* Shift Date From/To */}
					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label className="flex items-center gap-1">
								Shift Date From{' '}
								<span className="text-destructive">*</span>
							</Label>
							<Popover>
								<PopoverTrigger asChild>
									<Button
										variant="outline"
										className={cn(
											'w-full justify-start text-left font-normal',
											!shiftDateFrom &&
												'text-muted-foreground'
										)}
										disabled={
											areShiftDatesLocked ||
											isReadOnly ||
											hasBusyState
										}
									>
										<CalendarIcon className="mr-2 h-4 w-4" />
										{shiftDateFrom
											? format(
													shiftDateFrom,
													'MMM dd, yyyy'
												)
											: 'Select date'}
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
								Shift Date To{' '}
								<span className="text-destructive">*</span>
							</Label>
							<Popover>
								<PopoverTrigger asChild>
									<Button
										variant="outline"
										className={cn(
											'w-full justify-start text-left font-normal',
											!shiftDateTo &&
												'text-muted-foreground'
										)}
										disabled={
											areShiftDatesLocked ||
											isReadOnly ||
											hasBusyState
										}
									>
										<CalendarIcon className="mr-2 h-4 w-4" />
										{shiftDateTo
											? format(
													shiftDateTo,
													'MMM dd, yyyy'
												)
											: 'Select date'}
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
							<Label
								htmlFor="clockIn"
								className="flex items-center gap-1"
							>
								Clock-in Time{' '}
								<span className="text-destructive">*</span>
							</Label>
							<Input
								id="clockIn"
								type="time"
								value={clockInTime}
								onChange={e =>
									handleClockInTimeChange(e.target.value)
								}
								disabled={isReadOnly || hasBusyState}
							/>
						</div>

						<div className="space-y-2">
							<Label
								htmlFor="clockOut"
								className="flex items-center gap-1"
							>
								Clock-out Time{' '}
								<span className="text-destructive">*</span>
							</Label>
							<Input
								id="clockOut"
								type="time"
								value={clockOutTime}
								onChange={e =>
									handleClockOutTimeChange(e.target.value)
								}
								disabled={isReadOnly || hasBusyState}
							/>
						</div>
					</div>

					{/* Break Duration */}
					<div className="space-y-2">
						<Label htmlFor="breakDuration">
							Break Duration (minutes)
						</Label>
						<Input
							id="breakDuration"
							type="number"
							value={breakDuration}
							onChange={e =>
								handleBreakDurationChange(e.target.value)
							}
							disabled={isReadOnly || hasBusyState}
						/>
					</div>

					{/* Total Work Duration */}
					<div className="space-y-2">
						<Label>Total Work Duration</Label>
						<div className="p-3 rounded-md border bg-muted/50 font-medium">
							{calculateWorkDuration()}
						</div>
						{durationValidationMessage && (
							<p className="text-sm text-destructive">
								{durationValidationMessage}
							</p>
						)}
					</div>

					{/* Message */}
					<div className="space-y-2">
						<Label
							htmlFor="message"
							className="flex items-center gap-1"
						>
							Message <span className="text-destructive">*</span>
						</Label>
						<Textarea
							id="message"
							value={message}
							onChange={e => setMessage(e.target.value)}
							placeholder="Provide details about your adjustment request..."
							rows={4}
							disabled={isReadOnly || hasBusyState}
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
											<span className="text-sm">
												{file}
											</span>
										</div>
										<div className="flex items-center gap-1">
											<Button
												variant="ghost"
												size="icon"
												className="h-8 w-8"
												onClick={() =>
													toast.success(
														'Downloading ' + file
													)
												}
											>
												<Download className="h-4 w-4" />
											</Button>
											{!isReadOnly && (
												<Button
													variant="ghost"
													size="icon"
													className="h-8 w-8 text-destructive"
													onClick={() =>
														handleRemoveAttachment(
															index
														)
													}
													disabled={hasBusyState}
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
							<>
								<input
									ref={fileInputRef}
									type="file"
									className="hidden"
									multiple
									onChange={handleFilePicked}
								/>
								<Button
									type="button"
									variant="outline"
									className="w-full"
									onClick={handleAddAttachment}
									disabled={hasBusyState}
								>
									<Upload className="h-4 w-4 mr-2" />
									Upload Attachment
								</Button>
							</>
						)}
					</div>

					{/* Request Logs */}
					{existingRequest && (
						<div className="space-y-2">
							<Button
								variant="outline"
								className="w-full"
								onClick={() => setShowLogs(!showLogs)}
								disabled={hasBusyState}
							>
								{showLogs ? 'Hide' : 'View'} Request Logs
							</Button>

							{showLogs && (
								<div className="space-y-3 p-4 rounded-lg border bg-muted/30">
									{(existingRequest.logTrail ?? []).length ===
										0 && (
										<div className="text-sm text-muted-foreground">
											No logs found for this request.
										</div>
									)}

									{(existingRequest.logTrail ?? []).map(
										(log, index) => (
											<div
												key={`${log.status}-${index}`}
												className="flex items-start gap-3"
											>
												<div className="flex-shrink-0 w-8 h-8 rounded-full bg-vibrant-blue/20 flex items-center justify-center">
													{log.status ===
														'approved' && (
														<CheckCircle className="h-4 w-4 text-vibrant-green" />
													)}
													{log.status ===
														'denied' && (
														<XCircle className="h-4 w-4 text-destructive" />
													)}
													{(log.status ===
														'pending' ||
														log.status ===
															'cancelled') && (
														<Clock className="h-4 w-4 text-vibrant-blue" />
													)}
												</div>
												<div className="flex-1 space-y-1">
													<div className="flex items-center justify-between">
														<span className="font-medium">
															{log.status.toUpperCase()}
														</span>
														{getStatusBadge(
															log.status
														)}
													</div>
													<div className="text-sm text-muted-foreground">
														{format(
															log.date,
															'MMM dd, yyyy hh:mm a'
														)}
													</div>
													{log.approvedBy && (
														<div className="text-sm text-muted-foreground">
															By: {log.approvedBy}
														</div>
													)}
													{log.reason && (
														<div className="text-sm text-muted-foreground">
															Reason: {log.reason}
														</div>
													)}
												</div>
											</div>
										)
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
								This request has been {existingRequest?.status}{' '}
								and cannot be modified.
							</div>
						</div>
					)}
				</div>

				<DialogFooter className="gap-2">
					{existingRequest &&
						existingRequest.status === 'pending' &&
						onDelete && (
							<Button
								variant="destructive"
								onClick={handleDelete}
								disabled={hasBusyState}
							>
								<Trash2 className="h-4 w-4 mr-2" />
								Delete Request
							</Button>
						)}
					{existingRequest &&
						existingRequest.status === 'approved' &&
						onRevoke && (
							<Button
								variant="secondary"
								onClick={handleRevoke}
								disabled={hasBusyState}
							>
								Revoke Approval
							</Button>
						)}
					<Button
						variant="outline"
						onClick={onClose}
						disabled={hasBusyState}
					>
						{isReadOnly ? 'Close' : 'Cancel'}
					</Button>
					{!isReadOnly && (
						<Button onClick={handleSubmit} disabled={hasBusyState}>
							{existingRequest
								? 'Update Request'
								: 'Submit Request'}
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
