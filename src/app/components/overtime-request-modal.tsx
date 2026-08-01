import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { Badge } from './ui/badge'
import {
	AlertCircle,
	CalendarIcon,
	CheckCircle,
	Clock,
	Download,
	FileText,
	Trash2,
	Upload,
	X,
	XCircle,
} from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { cn } from './ui/utils'

type RequestStatus = 'pending' | 'approved' | 'denied' | 'cancelled'

export interface OvertimeRequestDraft {
	date: string
	startTime: string
	endTime: string
	purpose: string
	attachments: string[]
}

export interface OvertimeRequestState {
	requestId: string
	requestDate: string
	startTime: string
	endTime: string
	purpose: string
	attachments: string[]
	status: RequestStatus
	submittedAt?: string | null
	approvedBy?: string | null
	approvedAt?: string | null
	deniedReason?: string | null
	logs?: Array<{
		logId?: number
		status: RequestStatus
		loggedAt: string
		approvedBy?: string | null
		reason?: string | null
	}>
}

interface OvertimeRequestModalProps {
	open: boolean
	onClose: () => void
	selectedDate: string | null
	existingRequest?: OvertimeRequestState | null
	onSubmit: (request: OvertimeRequestDraft) => Promise<boolean>
	onDelete?: (requestId: string) => Promise<boolean>
	onRevoke?: (requestId: string) => Promise<boolean>
	isLoading?: boolean
}

export function OvertimeRequestModal({
	open,
	onClose,
	selectedDate,
	existingRequest,
	onSubmit,
	onDelete,
	onRevoke,
	isLoading = false,
}: OvertimeRequestModalProps) {
	const [startTime, setStartTime] = useState('')
	const [endTime, setEndTime] = useState('')
	const [purpose, setPurpose] = useState('')
	const [attachments, setAttachments] = useState<string[]>([])
	const [showLogs, setShowLogs] = useState(false)
	const [isSubmitting, setIsSubmitting] = useState(false)
	const fileInputRef = useRef<HTMLInputElement | null>(null)

	useEffect(() => {
		if (!open) {
			return
		}

		if (existingRequest) {
			setStartTime(existingRequest.startTime ?? '')
			setEndTime(existingRequest.endTime ?? '')
			setPurpose(existingRequest.purpose ?? '')
			setAttachments(
				Array.isArray(existingRequest.attachments)
					? existingRequest.attachments
					: []
			)
			return
		}

		// New overtime requests always start blank by requirement.
		setStartTime('')
		setEndTime('')
		setPurpose('')
		setAttachments([])
		setShowLogs(false)
	}, [open, existingRequest])

	const totalOtHours = useMemo(() => {
		if (!startTime || !endTime) {
			return 'NA'
		}

		const [startHour, startMinute] = startTime.split(':').map(Number)
		const [endHour, endMinute] = endTime.split(':').map(Number)
		if (
			Number.isNaN(startHour) ||
			Number.isNaN(startMinute) ||
			Number.isNaN(endHour) ||
			Number.isNaN(endMinute)
		) {
			return 'NA'
		}

		const totalMinutes =
			endHour * 60 + endMinute - (startHour * 60 + startMinute)
		if (totalMinutes <= 0) {
			return 'NA'
		}

		return (totalMinutes / 60).toFixed(2)
	}, [startTime, endTime])

	const hasBusyState = isLoading || isSubmitting
	const isReadOnly = existingRequest?.status === 'approved'
	const displayDate = selectedDate ? new Date(selectedDate) : undefined

	const getStatusBadge = (status: RequestStatus) => {
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
						Declined
					</Badge>
				)
			default:
				return <Badge variant="outline">Cancelled</Badge>
		}
	}

	const handleSubmit = async () => {
		if (!selectedDate) {
			toast.error('Please choose a calendar date first.')
			return
		}

		if (!startTime || !endTime) {
			toast.error('Please enter start and end times.')
			return
		}

		if (totalOtHours === 'NA') {
			toast.error('End time must be later than start time.')
			return
		}

		if (!purpose.trim()) {
			toast.error('Please enter a purpose.')
			return
		}

		if (attachments.length > 10) {
			toast.error('You can upload at most 10 attachments.')
			return
		}

		setIsSubmitting(true)
		const saved = await onSubmit({
			date: selectedDate,
			startTime,
			endTime,
			purpose: purpose.trim(),
			attachments,
		})
		setIsSubmitting(false)

		if (!saved) {
			return
		}

		toast.success(
			existingRequest
				? 'Overtime request updated.'
				: 'Overtime request submitted.'
		)
		onClose()
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
	}

	const handleRemoveAttachment = (index: number) => {
		setAttachments(prev => prev.filter((_, i) => i !== index))
	}

	const handleDelete = async () => {
		if (!existingRequest || !onDelete) {
			return
		}

		setIsSubmitting(true)
		const ok = await onDelete(existingRequest.requestId)
		setIsSubmitting(false)
		if (ok) {
			toast.success('Overtime request deleted.')
			onClose()
		}
	}

	const handleRevoke = async () => {
		if (!existingRequest || !onRevoke) {
			return
		}

		setIsSubmitting(true)
		const ok = await onRevoke(existingRequest.requestId)
		setIsSubmitting(false)
		if (ok) {
			toast.success('Approved overtime request has been revoked.')
			onClose()
		}
	}

	return (
		<Dialog open={open} onOpenChange={onClose}>
			<DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="flex items-center justify-between">
						<span>
							{existingRequest
								? 'View Overtime'
								: 'File Overtime'}
						</span>
						{existingRequest &&
							getStatusBadge(existingRequest.status)}
					</DialogTitle>
					<DialogDescription>
						{isReadOnly
							? 'View the details of this overtime request'
							: 'Fill in the details to request overtime'}
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

					<div className="space-y-2">
						<Label className="flex items-center gap-1">
							Date Requested{' '}
							<span className="text-destructive">*</span>
						</Label>
						<Button
							variant="outline"
							className={cn(
								'w-full justify-start text-left font-normal',
								!displayDate && 'text-muted-foreground'
							)}
							disabled
						>
							<CalendarIcon className="mr-2 h-4 w-4" />
							{displayDate
								? format(displayDate, 'dd/MM/yyyy')
								: 'Select date'}
						</Button>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label
								htmlFor="ot-start-time"
								className="flex items-center gap-1"
							>
								Start Time{' '}
								<span className="text-destructive">*</span>
							</Label>
							<Input
								id="ot-start-time"
								type="time"
								value={startTime}
								onChange={e => setStartTime(e.target.value)}
								disabled={isReadOnly || hasBusyState}
							/>
						</div>

						<div className="space-y-2">
							<Label
								htmlFor="ot-end-time"
								className="flex items-center gap-1"
							>
								End Time{' '}
								<span className="text-destructive">*</span>
							</Label>
							<Input
								id="ot-end-time"
								type="time"
								value={endTime}
								onChange={e => setEndTime(e.target.value)}
								disabled={isReadOnly || hasBusyState}
							/>
						</div>
					</div>

					<div className="space-y-2">
						<Label className="flex items-center gap-1">
							OT Duration(hrs){' '}
							<span className="text-destructive">*</span>
						</Label>
						<div className="p-3 rounded-md border bg-muted/50 font-medium">
							{totalOtHours}
						</div>
					</div>

					<div className="space-y-2">
						<Label
							htmlFor="ot-purpose"
							className="flex items-center gap-1"
						>
							Purpose <span className="text-destructive">*</span>
						</Label>
						<Textarea
							id="ot-purpose"
							value={purpose}
							onChange={e => setPurpose(e.target.value)}
							placeholder="Enter here.."
							rows={4}
							disabled={isReadOnly || hasBusyState}
						/>
					</div>

					<div className="space-y-2">
						<Label>Attachments (Optional)</Label>
						{attachments.length > 0 && (
							<div className="space-y-2">
								{attachments.map((file, index) => (
									<div
										key={`${file}-${index}`}
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
														`Downloading ${file}`
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
									Upload or drag your Supporting Document
									here(JPG/PNG/PDF)
								</Button>
							</>
						)}
					</div>

					{existingRequest && (
						<div className="space-y-2">
							<Button
								variant="outline"
								className="w-full"
								onClick={() => setShowLogs(prev => !prev)}
								disabled={hasBusyState}
							>
								{showLogs ? 'Hide' : 'View'} Request Logs
							</Button>

							{showLogs && (
								<div className="space-y-3 p-4 rounded-lg border bg-muted/30">
									{(existingRequest.logs ?? []).length ===
										0 && (
										<div className="text-sm text-muted-foreground">
											No logs found for this request.
										</div>
									)}

									{(existingRequest.logs ?? []).map(
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
															new Date(
																log.loggedAt
															),
															'MMM dd, yyyy hh:mm a'
														)}
													</div>
													{log.approvedBy && (
														<div className="text-sm text-muted-foreground">
															By: {log.approvedBy}
														</div>
													)}
													{log.reason && (
														<div className="text-sm text-muted-foreground whitespace-pre-wrap">
															{log.reason}
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

					{isReadOnly && (
						<div className="flex items-start gap-2 p-3 rounded-lg border bg-muted/50">
							<AlertCircle className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
							<div className="text-sm text-muted-foreground">
								This request has been approved and cannot be
								modified.
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
							Save
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
