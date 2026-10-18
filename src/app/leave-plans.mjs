import { addDays, addMonths, format, isWeekend, startOfDay } from 'date-fns'

const dateKey = date => format(date, 'yyyy-MM-dd')

export function generateLeavePlans({
    credits,
    holidays = [],
    requests = [],
    now = new Date(),
}) {
    if (!Number.isFinite(credits) || credits < 1) return []
    const requestedCredits = Math.ceil(credits / 2)
    const today = startOfDay(now)
    const lastDay = addMonths(today, 6)
    const holidayByDate = new Map(
        holidays.map(holiday => [holiday.date, holiday.name])
    )
    const blocked = requests.filter(request =>
        ['approved', 'pending'].includes(request.status)
    )
    const candidates = []

    for (
        let startDate = addDays(today, 1);
        startDate <= lastDay;
        startDate = addDays(startDate, 1)
    ) {
        let endDate = startDate
        let leaveCreditsUsed = 0
        let spanDays = 0
        let weekendDays = 0
        const holidayNames = new Set()

        for (
            let current = startDate;
            current <= lastDay;
            current = addDays(current, 1)
        ) {
            const key = dateKey(current)
            const weekend = isWeekend(current)
            const holiday = holidayByDate.has(key)
            // Include adjoining weekends and holidays after the last leave day.
            if (!weekend && !holiday && leaveCreditsUsed === requestedCredits)
                break
            if (weekend) weekendDays += 1
            else if (!holiday) leaveCreditsUsed += 1
            if (holiday) holidayNames.add(holidayByDate.get(key))
            endDate = current
            spanDays += 1
        }

        if (leaveCreditsUsed !== requestedCredits) continue
        const start = dateKey(startDate)
        const end = dateKey(endDate)
        if (
            blocked.some(
                request =>
                    start <= request.endDateKey && end >= request.startDateKey
            )
        )
            continue
        candidates.push({
            startDate,
            endDate,
            spanDays,
            leaveCreditsUsed,
            weekendDays,
            holidayNames: [...holidayNames],
        })
    }
    return candidates
}

export function filterLeavePlans(
    plans,
    { month = 'all', holidayOnly = false, sort = 'best' } = {}
) {
    return plans
        .filter(
            plan =>
                (month === 'all' ||
                    format(plan.startDate, 'yyyy-MM') === month) &&
                (!holidayOnly || plan.holidayNames.length > 0)
        )
        .sort(
            (a, b) =>
                (sort === 'best' ? b.spanDays - a.spanDays : 0) ||
                a.startDate.getTime() - b.startDate.getTime()
        )
}
