import { useState } from 'react'
import { LogIn, LogOut, Clock } from 'lucide-react'
import { Button } from './ui/button'
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

interface AttendanceActionsProps {
	isClockedIn: boolean
	onClockIn: () => void
	onClockOut: () => void
	onBreak: () => void
	isOnBreak: boolean
}

export function AttendanceActions({
	isClockedIn,
	onClockIn,
	onClockOut,
	onBreak,
	isOnBreak,
}: AttendanceActionsProps) {
	const [showClockoutDialog, setShowClockoutDialog] = useState(false)

	const handleClockoutClick = () => {
		setShowClockoutDialog(true)
	}

	const handleConfirmClockout = () => {
		setShowClockoutDialog(false)
		onClockOut()
	}

	return (
		<>
			<div className="px-4 mb-6">
				<div className="grid grid-cols-1 gap-4">
					{!isClockedIn ? (
						<Button
							onClick={onClockIn}
							className="h-16 bg-vibrant-green hover:bg-vibrant-green/90 text-vibrant-green-foreground text-lg font-semibold rounded-2xl shadow-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
						>
							<LogIn className="h-6 w-6 mr-3" />
							Clock In
						</Button>
					) : (
						<div className="grid grid-cols-2 gap-4">
							<Button
								onClick={onBreak}
								variant="outline"
								className={`h-16 text-lg font-semibold rounded-2xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${
									isOnBreak
										? 'bg-vibrant-orange text-vibrant-orange-foreground border-vibrant-orange'
										: 'border-vibrant-orange text-vibrant-orange hover:bg-vibrant-orange/10'
								}`}
							>
								<Clock className="h-5 w-5 mr-2" />
								{isOnBreak ? 'End Break' : 'Break'}
							</Button>

							<Button
								onClick={handleClockoutClick}
								className="h-16 bg-vibrant-pink hover:bg-vibrant-pink/90 text-vibrant-pink-foreground text-lg font-semibold rounded-2xl shadow-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
							>
								<LogOut className="h-6 w-6 mr-3" />
								Clock Out
							</Button>
						</div>
					)}
				</div>
			</div>

			<AlertDialog
				open={showClockoutDialog}
				onOpenChange={setShowClockoutDialog}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Confirm Clock Out</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to clock out? This will end
							your work session for today.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>No</AlertDialogCancel>
						<AlertDialogAction onClick={handleConfirmClockout}>
							Yes, Clock Out
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	)
}
