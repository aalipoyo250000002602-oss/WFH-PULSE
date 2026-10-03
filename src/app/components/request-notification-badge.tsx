import { cn } from './ui/utils'

interface RequestNotificationBadgeProps {
    count: number
    className?: string
}

export function RequestNotificationBadge({
    count,
    className,
}: RequestNotificationBadgeProps) {
    if (count <= 0) {
        return null
    }

    return (
        <span
            className={cn(
                'inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold leading-none text-white shadow-sm',
                className
            )}
            aria-label={`${count} unread request notification${count === 1 ? '' : 's'}`}
        >
            {count > 99 ? '99+' : count}
        </span>
    )
}
