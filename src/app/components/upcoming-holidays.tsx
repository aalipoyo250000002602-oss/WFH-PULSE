import { Calendar, Cake } from 'lucide-react'
import { Badge } from './ui/badge'
import { motion } from 'motion/react'

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
	const upcomingHolidays = holidays
		.filter(holiday => holiday.daysUntil >= 0)
		.sort((a, b) => a.daysUntil - b.daysUntil)
		.slice(0, 8)

	const upcomingBirthdays = celebrations
		.filter(item => item.daysUntil >= 0)
		.sort((a, b) => a.daysUntil - b.daysUntil)
		.slice(0, 8)

	return (
		<div className="space-y-4">
			{/* Upcoming Birthdays (Current Year) */}
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
								<div className="flex-1">
									<p className="text-sm font-medium">
										{item.name} 🎂
									</p>
									<p className="text-xs text-muted-foreground">
										{new Date(item.date).toLocaleDateString(
											'en-US',
											{
												month: 'short',
												day: 'numeric',
											}
										)}
									</p>
								</div>
								<Badge
									variant="outline"
									className="border-vibrant-pink text-vibrant-pink"
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
								className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
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
								<div className="flex items-center gap-3">
									<Calendar className="h-4 w-4 text-vibrant-purple" />
									<div>
										<p className="font-medium">
											{holiday.name}
										</p>
										<p className="text-sm text-muted-foreground">
											{new Date(
												holiday.date
											).toLocaleDateString('en-US', {
												month: 'short',
												day: 'numeric',
											})}
											{holiday.countryName
												? ` • ${holiday.countryName}`
												: ''}
										</p>
									</div>
								</div>
								<div className="text-right">
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
						No upcoming celebrations or holidays
					</motion.p>
				)}
		</div>
	)
}
