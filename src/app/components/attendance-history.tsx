import { Calendar, Clock, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'

interface AttendanceRecord {
	date: string
	clockIn: string
	clockOut?: string
	hoursWorked: string
	status: 'present' | 'late' | 'absent'
}

const mockData: AttendanceRecord[] = [
	{
		date: 'Today',
		clockIn: '9:00 AM',
		clockOut: '',
		hoursWorked: '3h 45m',
		status: 'present',
	},
	{
		date: 'Yesterday',
		clockIn: '9:15 AM',
		clockOut: '6:00 PM',
		hoursWorked: '8h 45m',
		status: 'late',
	},
	{
		date: 'Dec 6',
		clockIn: '8:45 AM',
		clockOut: '5:30 PM',
		hoursWorked: '8h 45m',
		status: 'present',
	},
	{
		date: 'Dec 5',
		clockIn: '9:00 AM',
		clockOut: '6:15 PM',
		hoursWorked: '9h 15m',
		status: 'present',
	},
	{
		date: 'Dec 4',
		clockIn: '',
		clockOut: '',
		hoursWorked: '0h',
		status: 'absent',
	},
]

export function AttendanceHistory() {
	return (
		<div className="px-4 space-y-4">
			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="flex items-center gap-2">
						<TrendingUp className="h-5 w-5 text-vibrant-blue" />
						This Week's Summary
					</CardTitle>
				</CardHeader>
				<CardContent className="grid grid-cols-3 gap-4">
					<div className="text-center">
						<p className="text-2xl font-bold text-vibrant-green">
							4
						</p>
						<p className="text-sm text-muted-foreground">
							Days Present
						</p>
					</div>
					<div className="text-center">
						<p className="text-2xl font-bold text-vibrant-orange">
							1
						</p>
						<p className="text-sm text-muted-foreground">
							Late Arrivals
						</p>
					</div>
					<div className="text-center">
						<p className="text-2xl font-bold text-vibrant-purple">
							42h
						</p>
						<p className="text-sm text-muted-foreground">
							Total Hours
						</p>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="flex items-center gap-2">
						<Calendar className="h-5 w-5 text-vibrant-purple" />
						Recent Activity
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					{mockData.map((record, index) => (
						<div
							key={index}
							className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
						>
							<div className="flex-1">
								<div className="flex items-center gap-2 mb-1">
									<p className="font-medium">{record.date}</p>
									<Badge
										variant="outline"
										className={`text-xs ${
											record.status === 'present'
												? 'border-vibrant-green text-vibrant-green'
												: record.status === 'late'
													? 'border-vibrant-orange text-vibrant-orange'
													: 'border-muted-foreground text-muted-foreground'
										}`}
									>
										{record.status}
									</Badge>
								</div>
								<div className="flex items-center gap-4 text-sm text-muted-foreground">
									<span className="flex items-center gap-1">
										<Clock className="h-3 w-3" />
										{record.clockIn || 'No clock-in'} -{' '}
										{record.clockOut || 'Active'}
									</span>
								</div>
							</div>
							<div className="text-right">
								<p className="font-semibold text-vibrant-blue">
									{record.hoursWorked}
								</p>
							</div>
						</div>
					))}
				</CardContent>
			</Card>
		</div>
	)
}
