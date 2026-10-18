import { cn } from './ui/utils'

interface RequestNotificationBadgeProps {
    count: number
    className?: string
    variant?: 'count' | 'dot'
}

export function RequestNotificationBadge({
    count,
    className,
    variant = 'count',
}: RequestNotificationBadgeProps) {
    if (count <= 0) {
        return null
    }

    return (
        <span
            className={cn(
                'inline-flex shrink-0 rounded-full bg-destructive shadow-sm',
                variant === 'dot'
                    ? 'h-2.5 w-2.5'
                    : 'min-w-5 h-5 items-center justify-center px-1.5 text-[10px] font-bold leading-none text-white',
                className
            )}
            aria-label={`${count} unread request notification${count === 1 ? '' : 's'}`}
        >
            {variant === 'count' ? (count > 99 ? '99+' : count) : null}
        </span>
    )
}
