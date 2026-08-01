import { Home, Inbox, Calendar, BarChart3, Settings } from 'lucide-react'

interface BottomNavigationProps {
	currentPage: string
	onPageChange: (page: string) => void
}

export function BottomNavigation({
	currentPage,
	onPageChange,
}: BottomNavigationProps) {
	const navItems = [
		{ id: 'home', label: 'Home', icon: Home },
		{ id: 'dashboard', label: 'Requests', icon: Inbox },
		{ id: 'calendar', label: 'Calendar', icon: Calendar },
		{ id: 'analytics', label: 'Analytics', icon: BarChart3 },
		{ id: 'settings', label: 'Settings', icon: Settings },
	]

	return (
		<nav className="fixed bottom-0 left-1/2 transform -translate-x-1/2 w-full max-w-md bg-card border-t border-border">
			<div className="grid grid-cols-5 h-16">
				{navItems.map(({ id, label, icon: Icon }) => (
					<button
						key={id}
						onClick={() => onPageChange(id)}
						className={`flex flex-col items-center justify-center gap-1 transition-all duration-200 ${
							currentPage === id
								? 'text-vibrant-blue bg-vibrant-blue/10'
								: 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
						}`}
					>
						<Icon
							className={`h-5 w-5 ${currentPage === id ? 'text-vibrant-blue' : ''}`}
						/>
						<span className="text-xs font-medium">{label}</span>
					</button>
				))}
			</div>
		</nav>
	)
}
