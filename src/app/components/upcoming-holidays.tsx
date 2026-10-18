import { Calendar, Cake } from 'lucide-react'
import { Badge } from './ui/badge'
import { motion } from 'motion/react'
import { parseISO } from 'date-fns'
import { getUpcomingEvents } from '../upcoming-events.mjs'

interface Holiday {
	id: string
	name: string
	date: string
	type: 'public' | 'personal'
	countryCode?: string
	countryName?: string
	daysUntil: number
}

interface UpcomingHolidaysProps {
	holidays: Holiday[]
	celebrations: Array<{
		id: string
		type: 'birthday'
		employeeId: string
		name: string
		date: string
		daysUntil: number
	}>
}

export function UpcomingHolidays({
	holidays,
	celebrations,
}: UpcomingHolidaysProps) {
	const today = new Date()
	const upcomingHolidays = getUpcomingEvents(holidays, today)
	const upcomingBirthdays = getUpcomingEvents(celebrations, today)

	return (
		<div className="space-y-4">
			{/* Celebrations within the same six-month window as holidays. */}
			{upcomingBirthdays.length > 0 && (
				<motion.div
					initial={{ opacity: 0, y: 10 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.3, delay: 0.1 }}
				>
					<p className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1">
						<Cake className="h-3 w-3" />
						Upcoming Birthdays
					</p>
					<div className="space-y-2">
						{upcomingBirthdays.map((item, index) => (
							<motion.div
								key={item.id}
								className="flex items-center gap-2 p-2 rounded-lg bg-vibrant-pink/10"
								initial={{ opacity: 0, x: -20 }}
								animate={{ opacity: 1, x: 0 }}
								transition={{
									duration: 0.3,
									delay: 0.15 + index * 0.05,
								}}
							>
								<Cake className="h-4 w-4 text-vibrant-pink flex-shrink-0" />
								<div className="flex-1 min-w-0">
									<p className="text-sm font-medium break-words">
										{item.name} 🎂
									</p>
									<p className="text-xs text-muted-foreground">
										{parseISO(item.date).toLocaleDateString(
											'en-US',
											{
												month: 'short',
												day: 'numeric',
												year: 'numeric',
											}
										)}
									</p>
								</div>
								<Badge
									variant="outline"
									className="border-vibrant-pink text-vibrant-pink shrink-0 whitespace-nowrap"
								>
									{item.daysUntil === 0
										? 'Today'
										: item.daysUntil === 1
											? 'Tomorrow'
											: `${item.daysUntil} days`}
								</Badge>
							</motion.div>
						))}
					</div>
				</motion.div>
			)}

			{/* Upcoming Holidays */}
			{upcomingHolidays.length > 0 && (
				<motion.div
					initial={{ opacity: 0, y: 10 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{
						duration: 0.3,
						delay: (upcomingBirthdays.length > 0 ? 0.1 : 0) + 0.1,
					}}
				>
					<p className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1">
						<Calendar className="h-3 w-3" />
						Upcoming Holidays
					</p>
					<div className="space-y-2">
						{upcomingHolidays.map((holiday, index) => (
							<motion.div
								key={holiday.id}
								className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/30"
								initial={{ opacity: 0, x: -20 }}
								animate={{ opacity: 1, x: 0 }}
								transition={{
									duration: 0.3,
									delay:
										(upcomingBirthdays.length > 0
											? 0.15
											: 0) +
										0.15 +
										index * 0.05,
								}}
							>
								<div className="flex items-center gap-3 min-w-0">
									<Calendar className="h-4 w-4 text-vibrant-purple shrink-0" />
									<div className="min-w-0">
										<p className="font-medium break-words">
											{holiday.name}
										</p>
										<p className="text-sm text-muted-foreground">
											{parseISO(
												holiday.date
											).toLocaleDateString('en-US', {
												month: 'short',
												day: 'numeric',
												year: 'numeric',
											})}
											{holiday.countryName
												? ` • ${holiday.countryName}`
												: ''}
										</p>
									</div>
								</div>
								<div className="text-right shrink-0 whitespace-nowrap">
									<Badge
										variant="outline"
										className={`${
											holiday.type === 'public'
												? 'border-vibrant-blue text-vibrant-blue'
												: 'border-vibrant-pink text-vibrant-pink'
										}`}
									>
										{holiday.daysUntil === 0
											? 'Today'
											: holiday.daysUntil === 1
												? 'Tomorrow'
												: `${holiday.daysUntil} days`}
									</Badge>
								</div>
							</motion.div>
						))}
					</div>
				</motion.div>
			)}

			{upcomingHolidays.length === 0 &&
				upcomingBirthdays.length === 0 && (
					<motion.p
						className="text-muted-foreground text-sm text-center py-4"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ duration: 0.3, delay: 0.1 }}
					>
							No holidays or celebrations in the next 6 months.
					</motion.p>
				)}
		</div>
	)
}
