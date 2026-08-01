import {
	ChevronLeft,
	ChevronRight,
	Calendar as CalendarIcon,
} from 'lucide-react'
import { Button } from './ui/button'
import { useState } from 'react'
import { motion } from 'motion/react'

interface MiniCalendarProps {
	attendanceData: Record<
		string,
		'present' | 'absent' | 'holiday' | 'late' | 'on-leave'
	>
	onDateClick?: (date: string) => void
}

export function MiniCalendar({
	attendanceData,
	onDateClick,
}: MiniCalendarProps) {
	const [currentDate, setCurrentDate] = useState(new Date())

	const formatLocalDateKey = (date: Date) => {
		const year = date.getFullYear()
		const month = String(date.getMonth() + 1).padStart(2, '0')
		const day = String(date.getDate()).padStart(2, '0')
		return `${year}-${month}-${day}`
	}

	const getDaysInMonth = (date: Date) => {
		const year = date.getFullYear()
		const month = date.getMonth()
		const firstDay = new Date(year, month, 1)
		const lastDay = new Date(year, month + 1, 0)
		const daysInMonth = lastDay.getDate()
		// Get day of week (0 = Sunday, 1 = Monday, etc.)
		const startingDayOfWeek = firstDay.getDay()
		// Convert to Monday-based (0 = Monday, 6 = Sunday)
		const mondayBasedStart =
			startingDayOfWeek === 0 ? 6 : startingDayOfWeek - 1

		const days = []

		// Add empty cells for days before the first day of the month
		for (let i = 0; i < mondayBasedStart; i++) {
			days.push(null)
		}

		// Add days of the month
		for (let day = 1; day <= daysInMonth; day++) {
			days.push(day)
		}

		return days
	}

	const getDateKey = (day: number) => {
		const date = new Date(
			currentDate.getFullYear(),
			currentDate.getMonth(),
			day
		)
		return formatLocalDateKey(date)
	}

	const getDayStatus = (day: number) => {
		const dateKey = getDateKey(day)
		return attendanceData[dateKey] || null
	}

	const isFutureDate = (day: number) => {
		const date = new Date(
			currentDate.getFullYear(),
			currentDate.getMonth(),
			day
		)
		date.setHours(0, 0, 0, 0)
		const today = new Date()
		today.setHours(0, 0, 0, 0)
		return date > today
	}

	const isWeekend = (day: number) => {
		const date = new Date(
			currentDate.getFullYear(),
			currentDate.getMonth(),
			day
		)
		const dayOfWeek = date.getDay()
		// Sunday = 0, Saturday = 6
		return dayOfWeek === 0 || dayOfWeek === 6
	}

	const getStatusColor = (
		status: string | null,
		isToday: boolean,
		isFuture: boolean,
		isWeekendDay: boolean
	) => {
		if (isFuture) return 'text-muted-foreground/30 cursor-not-allowed'
		if (isWeekendDay) return 'text-muted-foreground/50 bg-muted/20'
		if (isToday) return 'bg-vibrant-blue text-vibrant-blue-foreground'

		switch (status) {
			case 'present':
				return 'bg-vibrant-green/20 text-vibrant-green border-vibrant-green/30 cursor-pointer hover:bg-vibrant-green/30'
			case 'late':
				return 'bg-vibrant-orange/20 text-vibrant-orange border-vibrant-orange/30 cursor-pointer hover:bg-vibrant-orange/30'
			case 'absent':
				return 'bg-destructive/20 text-destructive border-destructive/30 cursor-pointer hover:bg-destructive/30'
			case 'on-leave':
				return 'bg-vibrant-purple/20 text-vibrant-purple border-vibrant-purple/30 cursor-pointer hover:bg-vibrant-purple/30'
			case 'holiday':
				return 'bg-vibrant-purple/20 text-vibrant-purple border-vibrant-purple/30 cursor-pointer hover:bg-vibrant-purple/30'
			default:
				return 'text-muted-foreground hover:bg-muted/50'
		}
	}

	const navigateMonth = (direction: 'prev' | 'next') => {
		setCurrentDate(prev => {
			const newDate = new Date(prev)
			if (direction === 'prev') {
				newDate.setMonth(prev.getMonth() - 1)
			} else {
				newDate.setMonth(prev.getMonth() + 1)
			}
			return newDate
		})
	}

	const monthYear = currentDate.toLocaleDateString('en-US', {
		month: 'long',
		year: 'numeric',
	})

	const days = getDaysInMonth(currentDate)
	const today = new Date()
	const isCurrentMonth =
		currentDate.getMonth() === today.getMonth() &&
		currentDate.getFullYear() === today.getFullYear()

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<span className="text-sm font-medium flex items-center gap-2">
					<CalendarIcon className="h-4 w-4 text-vibrant-blue" />
					{monthYear}
				</span>
				<div className="flex items-center gap-1">
					<Button
						variant="ghost"
						size="icon"
						onClick={() => navigateMonth('prev')}
						className="h-8 w-8"
					>
						<ChevronLeft className="h-4 w-4" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						onClick={() => navigateMonth('next')}
						className="h-8 w-8"
					>
						<ChevronRight className="h-4 w-4" />
					</Button>
				</div>
			</div>
			<div>
				<div className="grid grid-cols-7 gap-1 mb-2">
					{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => (
						<div
							key={`header-${index}`}
							className="text-center text-xs font-medium text-muted-foreground p-2"
						>
							{day}
						</div>
					))}
				</div>
				<div className="grid grid-cols-7 gap-1">
					{days.map((day, index) => {
						if (!day) {
							return (
								<div key={`empty-${index}`} className="p-2" />
							)
						}

						const isToday =
							isCurrentMonth && day === today.getDate()
						const status = getDayStatus(day)
						const isFuture = isFutureDate(day)
						const isWeekendDay = isWeekend(day)

						const dateKey = getDateKey(day)
						const hasData = status !== null

						return (
							<motion.button
								key={`day-${currentDate.getMonth()}-${day}`}
								className={`p-2 text-sm rounded-md border transition-colors ${getStatusColor(status, isToday, isFuture, isWeekendDay)}`}
								disabled={isFuture || isWeekendDay}
								onClick={() =>
									hasData &&
									onDateClick &&
									onDateClick(dateKey)
								}
								initial={{ opacity: 0, scale: 0.8 }}
								animate={{ opacity: 1, scale: 1 }}
								transition={{
									duration: 0.2,
									delay: index * 0.01,
								}}
							>
								{day}
							</motion.button>
						)
					})}
				</div>

				<div className="grid grid-cols-2 gap-2 mt-4 text-xs">
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
						<span className="text-muted-foreground">On Leave</span>
					</div>
				</div>
			</div>
		</div>
	)
}
