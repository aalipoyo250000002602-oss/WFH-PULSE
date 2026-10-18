import {
    addMonths,
    differenceInCalendarDays,
    isValid,
    parseISO,
    startOfDay,
} from 'date-fns'

export function getUpcomingEvents(events, now = new Date()) {
    const today = startOfDay(now)
    const lastDay = addMonths(today, 6)

    return events
        .map(event => {
            const date = startOfDay(parseISO(event.date))
            if (!isValid(date) || date < today || date > lastDay) return null
            // API and fallback countdowns may be stale; use the actual calendar date.
            return { ...event, daysUntil: differenceInCalendarDays(date, today) }
        })
        .filter(event => event !== null)
        .sort((a, b) => a.daysUntil - b.daysUntil)
}
