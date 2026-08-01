import { useState } from 'react'
import { Moon, Sun, User, LogOut } from 'lucide-react'
import { Button } from './ui/button'
import { Avatar, AvatarFallback } from './ui/avatar'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from './ui/dialog'

interface AttendanceHeaderProps {
	isDarkMode: boolean
	onToggleTheme: () => void
	onLogout: () => void
}

export function AttendanceHeader({
	isDarkMode,
	onToggleTheme,
	onLogout,
}: AttendanceHeaderProps) {
	const [showLogoutDialog, setShowLogoutDialog] = useState(false)
	const currentDate = new Date().toLocaleDateString('en-US', {
		weekday: 'long',
		year: 'numeric',
		month: 'long',
		day: 'numeric',
	})

	// Dynamic greeting based on time
	const getGreeting = () => {
		const hour = new Date().getHours()
		if (hour < 12) return 'Good Morning'
		if (hour < 18) return 'Good Afternoon'
		return 'Good Evening'
	}

	const handleLogoutClick = () => {
		setShowLogoutDialog(true)
	}

	const handleConfirmLogout = () => {
		setShowLogoutDialog(false)
		onLogout()
	}

	return (
		<>
			<header className="fixed top-0 left-1/2 z-40 flex w-full max-w-md -translate-x-1/2 items-center justify-between border-b border-border bg-card p-4">
				<div className="flex items-center gap-3">
					<Avatar className="h-10 w-10">
						<AvatarFallback className="bg-vibrant-blue text-vibrant-blue-foreground">
							<User className="h-5 w-5" />
						</AvatarFallback>
					</Avatar>
					<div>
						<h1 className="text-lg font-semibold">
							{getGreeting()} Alex!
						</h1>
						<p className="text-sm text-muted-foreground">
							{currentDate}
						</p>
					</div>
				</div>

				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						size="icon"
						onClick={onToggleTheme}
						className="h-9 w-9"
					>
						{isDarkMode ? (
							<Sun className="h-4 w-4" />
						) : (
							<Moon className="h-4 w-4" />
						)}
					</Button>
					<Button
						variant="outline"
						size="icon"
						onClick={handleLogoutClick}
						className="h-9 w-9"
					>
						<LogOut className="h-4 w-4" />
					</Button>
				</div>
			</header>

			{/* Logout Confirmation Dialog */}
			<Dialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Confirm Logout</DialogTitle>
						<DialogDescription>
							Are you sure you want to log out? Any unsaved
							changes will be lost.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4">
						<div className="flex gap-2">
							<Button
								onClick={handleConfirmLogout}
								className="flex-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
							>
								Yes, Logout
							</Button>
							<Button
								variant="outline"
								onClick={() => setShowLogoutDialog(false)}
								className="flex-1"
							>
								Cancel
							</Button>
						</div>
					</div>
				</DialogContent>
			</Dialog>
		</>
	)
}
