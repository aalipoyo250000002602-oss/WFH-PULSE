import { useEffect, useMemo, useRef, useState } from 'react'
import { apiFetch as fetch } from '../api-fetch.mjs'
import {
    CalendarDays,
    CheckCircle2,
    Info,
    Sparkles,
    WandSparkles,
} from 'lucide-react'
import { format, addDays, isWeekend } from 'date-fns'
import { toast } from 'sonner'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from './ui/card'
import { Label } from './ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from './ui/select'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'

interface PlannerHoliday {
    date: string
    name: string
}

interface PlannerLeaveType {
    id: string
    name: string
    credits: number
}

interface PlannerLeaveRequest {
    startDateKey: string
    endDateKey: string
    status: 'approved' | 'denied' | 'pending' | 'cancelled'
}

export interface LeavePlan {
    leaveTypeId: string
    startDate: string
    endDate: string
    message: string
}

interface SmartLeavePlannerProps {
    apiBaseUrl: string
    accessToken: string
    leaveTypes: PlannerLeaveType[]
    holidays: PlannerHoliday[]
    requests: PlannerLeaveRequest[]
    onSelectPlan: (plan: LeavePlan) => void
}

interface SuggestedPlan {
    startDate: Date
    endDate: Date
    spanDays: number
    leaveCreditsUsed: number
    weekendDays: number
    holidayNames: string[]
}

interface PlanAiInsight {
    bullets: string[]
    events: string[]
    source: 'gemini' | 'fallback'
}

const dateKey = (date: Date) => format(date, 'yyyy-MM-dd')

const FALLBACK_BULLET_LIMIT = 2
const FALLBACK_EVENT_LIMIT = 4
const fallbackRegionalEvents = [
    'Philippines: Kadayawan-style local harvest fairs and barangay food markets.',
    'Philippines: University week festivals, local intramurals, and city foundation events.',
    'Australia: Spring wine-and-food festivals and weekend coastal community markets.',
    'Australia: Arts-night programs and regional music events in major capitals.',
    'United States: Fall county fairs, college football weekends, and farmers markets.',
    'United States: Community parades, downtown cultural weekends, and food truck festivals.',
]

function buildPlanKey(startDate: Date, endDate: Date) {
    return `${dateKey(startDate)}-${dateKey(endDate)}`
}

function buildFallbackAiInsight(plan: SuggestedPlan): PlanAiInsight {
    const holidayHint =
        plan.holidayNames.length > 0
            ? `Registered holiday overlap: ${plan.holidayNames.join(', ')}.`
            : 'No registered company holiday overlaps in this range.'

    const offset = plan.startDate.getMonth() % fallbackRegionalEvents.length
    const events = Array.from({ length: FALLBACK_EVENT_LIMIT }, (_, index) => {
        const eventIndex = (offset + index) % fallbackRegionalEvents.length
        return fallbackRegionalEvents[eventIndex]
    })

    const bullets = [
        `Includes ${plan.weekendDays} weekend day${plan.weekendDays === 1 ? '' : 's'} to stretch your time away.`,
        holidayHint,
    ]

    return {
        bullets: bullets.slice(0, FALLBACK_BULLET_LIMIT),
        events: events.slice(0, FALLBACK_EVENT_LIMIT),
        source: 'fallback',
    }
}

export function SmartLeavePlanner({
    apiBaseUrl,
    accessToken,
    leaveTypes,
    holidays,
    requests,
    onSelectPlan,
}: SmartLeavePlannerProps) {
    const [leaveTypeId, setLeaveTypeId] = useState('')
    const [hasGenerated, setHasGenerated] = useState(false)
    const [selectedPlanKey, setSelectedPlanKey] = useState('')
    const [aiInsights, setAiInsights] = useState<Record<string, PlanAiInsight>>(
        {}
    )
    const [isAiLoading, setIsAiLoading] = useState(false)
    const [isUsingLiveAi, setIsUsingLiveAi] = useState(false)
    const hasShownAiUnavailableToast = useRef(false)

    const selectedLeaveType = leaveTypes.find(type => type.id === leaveTypeId)
    const holidayByDate = useMemo(
        () => new Map(holidays.map(holiday => [holiday.date, holiday.name])),
        [holidays]
    )
    const canFetchLiveInsights = Boolean(apiBaseUrl && accessToken)

    const plans = useMemo<SuggestedPlan[]>(() => {
        if (!hasGenerated || !selectedLeaveType) {
            return []
        }

        const requestedCredits = Math.max(
            1,
            Math.ceil(selectedLeaveType.credits / 2)
        )
        if (!Number.isInteger(requestedCredits) || requestedCredits < 1) {
            return []
        }
        const holidayDateSet = new Set(
            holidays.map(holiday => holiday.date).filter(Boolean)
        )

        const blockedRanges = requests
            .filter(
                request =>
                    request.status === 'approved' ||
                    request.status === 'pending'
            )
            .map(request => ({
                start: request.startDateKey,
                end: request.endDateKey,
            }))

        const today = new Date()
        const candidates: SuggestedPlan[] = []
        for (
            let offset = 1;
            offset <= 90 && candidates.length < 20;
            offset += 1
        ) {
            const startDate = addDays(today, offset)
            let endDate = startDate
            let leaveCreditsUsed = 0
            let spanDays = 0
            const holidayNames: string[] = []
            let weekendDays = 0

            while (leaveCreditsUsed < requestedCredits && spanDays < 45) {
                const currentDate = addDays(startDate, spanDays)
                const currentDateKey = dateKey(currentDate)
                const isWeekendDay = isWeekend(currentDate)
                const isHolidayDay = holidayDateSet.has(currentDateKey)

                if (isWeekendDay) {
                    weekendDays += 1
                } else if (!isHolidayDay) {
                    leaveCreditsUsed += 1
                }

                const holidayName = holidayByDate.get(currentDateKey)
                if (holidayName) {
                    holidayNames.push(holidayName)
                }

                endDate = currentDate
                spanDays += 1
            }

            if (leaveCreditsUsed < requestedCredits) {
                continue
            }

            const startKey = dateKey(startDate)
            const endKey = dateKey(endDate)
            const overlapsExistingRequest = blockedRanges.some(
                range => startKey <= range.end && endKey >= range.start
            )

            if (overlapsExistingRequest) {
                continue
            }

            candidates.push({
                startDate,
                endDate,
                spanDays,
                leaveCreditsUsed,
                weekendDays,
                holidayNames,
            })
        }

        return candidates
            .sort(
                (a, b) =>
                    b.weekendDays +
                    b.holidayNames.length -
                    (a.weekendDays + a.holidayNames.length)
            )
            .slice(0, 3)
    }, [
        hasGenerated,
        holidayByDate,
        holidays,
        leaveTypeId,
        requests,
        selectedLeaveType,
    ])

    useEffect(() => {
        if (!plans.length) {
            setAiInsights({})
            setIsAiLoading(false)
            setIsUsingLiveAi(false)
            return
        }

        const fallbackInsights = plans.reduce<Record<string, PlanAiInsight>>(
            (accumulator, plan) => {
                accumulator[buildPlanKey(plan.startDate, plan.endDate)] =
                    buildFallbackAiInsight(plan)
                return accumulator
            },
            {}
        )

        if (!canFetchLiveInsights) {
            setAiInsights(fallbackInsights)
            setIsAiLoading(false)
            setIsUsingLiveAi(false)
            return
        }

        const controller = new AbortController()
        setIsAiLoading(true)

        const fetchAiContext = async () => {
            try {
                const plansForRequest = plans.map(plan => ({
                    rangeStart: dateKey(plan.startDate),
                    rangeEnd: dateKey(plan.endDate),
                    weekendDays: plan.weekendDays,
                    registeredHolidays: plan.holidayNames,
                }))

                const response = await fetch(
                    `${apiBaseUrl}/me/leave-planner/insights`,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${accessToken}`,
                        },
                        body: JSON.stringify({ plans: plansForRequest }),
                        signal: controller.signal,
                    }
                )

                if (!response.ok) {
                    throw new Error(
                        `Planner insights request failed with status ${response.status}`
                    )
                }

                const data = (await response.json()) as unknown
                const rawInsights = (data as { insights?: unknown[] } | null)
                    ?.insights
                if (!Array.isArray(rawInsights)) {
                    throw new Error('Planner insights payload is invalid')
                }

                const generatedContext: Record<string, PlanAiInsight> = {}

                for (const item of rawInsights) {
                    if (!item || typeof item !== 'object') {
                        continue
                    }

                    const rangeStart =
                        typeof (item as { rangeStart?: unknown }).rangeStart ===
                        'string'
                            ? (item as { rangeStart: string }).rangeStart
                            : ''
                    const rangeEnd =
                        typeof (item as { rangeEnd?: unknown }).rangeEnd ===
                        'string'
                            ? (item as { rangeEnd: string }).rangeEnd
                            : ''
                    const bullets = Array.isArray(
                        (item as { bullets?: unknown[] }).bullets
                    )
                        ? (item as { bullets: unknown[] }).bullets
                              .filter(
                                  bullet =>
                                      typeof bullet === 'string' &&
                                      bullet.trim().length > 0
                              )
                              .map(bullet => bullet.trim())
                              .slice(0, FALLBACK_BULLET_LIMIT)
                        : []
                    const events = Array.isArray(
                        (item as { events?: unknown[] }).events
                    )
                        ? (item as { events: unknown[] }).events
                              .filter(
                                  event =>
                                      typeof event === 'string' &&
                                      event.trim().length > 0
                              )
                              .map(event => event.trim())
                              .slice(0, FALLBACK_EVENT_LIMIT)
                        : []

                    if (!rangeStart || !rangeEnd || bullets.length === 0) {
                        continue
                    }

                    generatedContext[`${rangeStart}-${rangeEnd}`] = {
                        bullets,
                        events,
                        source: 'gemini',
                    }
                }

                const mergedInsights = plans.reduce<
                    Record<string, PlanAiInsight>
                >((accumulator, plan) => {
                    const key = buildPlanKey(plan.startDate, plan.endDate)
                    accumulator[key] =
                        generatedContext[key] ?? fallbackInsights[key]
                    return accumulator
                }, {})

                setAiInsights(mergedInsights)
                setIsUsingLiveAi(true)
                setIsAiLoading(false)
            } catch (error) {
                if (controller.signal.aborted) {
                    return
                }

                console.error(
                    'Smart Leave Planner: unable to fetch live AI insights',
                    error
                )
                setAiInsights(fallbackInsights)
                setIsUsingLiveAi(false)
                setIsAiLoading(false)
                if (!hasShownAiUnavailableToast.current) {
                    toast.warning(
                        'Live AI event context is unavailable. Showing built-in schedule guidance.'
                    )
                    hasShownAiUnavailableToast.current = true
                }
            }
        }

        fetchAiContext()
        return () => {
            controller.abort()
        }
    }, [accessToken, apiBaseUrl, canFetchLiveInsights, plans])

    const handleGenerate = () => {
        setHasGenerated(true)
    }

    return (
        <Card className="border-vibrant-purple/30 bg-gradient-to-br from-vibrant-purple/5 to-vibrant-blue/5">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-vibrant-purple" />
                    Pulse AI Smart Leave Planner
                </CardTitle>
                <CardDescription>
                    Find leave dates that maximize long weekends and avoid
                    conflicts with your existing requests.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                    <div className="min-w-0 space-y-2">
                        <Label>Leave type</Label>
                        <Select
                            value={leaveTypeId}
                            onValueChange={value => {
                                setLeaveTypeId(value)
                                setHasGenerated(false)
                                setSelectedPlanKey('')
                            }}
                        >
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="Choose leave type" />
                            </SelectTrigger>
                            <SelectContent>
                                {leaveTypes.map(type => (
                                    <SelectItem key={type.id} value={type.id}>
                                        {type.name} ({type.credits} credits)
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                            Recommendations use half of your available credits
                            for the selected leave type (rounded up).
                        </p>
                    </div>
                    <Button
                        onClick={handleGenerate}
                        disabled={!selectedLeaveType}
                        className="w-full whitespace-nowrap bg-vibrant-purple hover:bg-vibrant-purple/90 md:w-auto"
                    >
                        <WandSparkles className="mr-2 h-4 w-4" />
                        Find dates
                    </Button>
                </div>

                {hasGenerated && plans.length === 0 && (
                    <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                        Choose a leave type with available credits to generate
                        recommendations.
                    </p>
                )}

                {plans.length > 0 && (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-sm font-medium">
                                <CalendarDays className="h-4 w-4 text-vibrant-blue" />
                                Recommended schedules
                            </div>
                            <Badge
                                variant="secondary"
                                className="border border-vibrant-blue/20 bg-vibrant-blue/10 text-vibrant-blue"
                            >
                                Top 3 options
                            </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {isAiLoading
                                ? 'Loading live AI event context...'
                                : isUsingLiveAi
                                  ? 'Live AI event context is active.'
                                  : canFetchLiveInsights
                                    ? 'Built-in schedule guidance is shown while live AI context is unavailable.'
                                    : 'Live AI context needs a signed-in session and API connection.'}
                        </p>
                        {plans.map(plan => {
                            const planStart = dateKey(plan.startDate)
                            const planEnd = dateKey(plan.endDate)
                            const planKey = `${planStart}-${planEnd}`
                            const planInsight =
                                aiInsights[planKey] ??
                                buildFallbackAiInsight(plan)
                            const isSelected = selectedPlanKey === planKey
                            return (
                                <div
                                    key={planKey}
                                    className={`grid gap-3 rounded-xl border p-4 shadow-sm transition-colors ${
                                        isSelected
                                            ? 'border-vibrant-purple bg-vibrant-purple/10'
                                            : 'bg-background/80'
                                    }`}
                                >
                                    <div className="min-w-0">
                                        <p className="text-base font-semibold leading-tight">
                                            {format(plan.startDate, 'MMM d')} –{' '}
                                            {format(
                                                plan.endDate,
                                                'MMM d, yyyy'
                                            )}
                                        </p>
                                        <div className="mt-1 flex flex-wrap gap-2">
                                            <Badge variant="outline">
                                                {plan.leaveCreditsUsed} leave
                                                credit
                                                {plan.leaveCreditsUsed === 1
                                                    ? ''
                                                    : 's'}
                                            </Badge>
                                            <Badge variant="outline">
                                                {plan.spanDays} total day
                                                {plan.spanDays === 1 ? '' : 's'}
                                            </Badge>
                                            {plan.weekendDays > 0 && (
                                                <Badge
                                                    variant="outline"
                                                    className="border-vibrant-green/40 text-vibrant-green"
                                                >
                                                    {plan.weekendDays} weekend
                                                    day
                                                    {plan.weekendDays === 1
                                                        ? ''
                                                        : 's'}
                                                </Badge>
                                            )}
                                            {plan.holidayNames.map(name => (
                                                <Badge
                                                    key={name}
                                                    variant="outline"
                                                    className="border-vibrant-orange/40 text-vibrant-orange"
                                                >
                                                    {name}
                                                </Badge>
                                            ))}
                                        </div>
                                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                                            {planInsight.bullets[1] ??
                                                planInsight.bullets[0]}
                                        </p>
                                    </div>
                                    <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-vibrant-blue/20 bg-gradient-to-b from-vibrant-blue/10 to-vibrant-blue/5 p-3">
                                        <div className="space-y-2.5">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-vibrant-blue/90">
                                                Trip intelligence
                                            </p>
                                            <div className="flex flex-wrap gap-2">
                                                <Badge
                                                    variant="secondary"
                                                    className="border border-vibrant-blue/20 bg-background/70"
                                                >
                                                    {planInsight.source ===
                                                    'gemini'
                                                        ? 'Live AI'
                                                        : 'Smart Guide'}
                                                </Badge>
                                                <Badge
                                                    variant="outline"
                                                    className="bg-background/70"
                                                >
                                                    {planInsight.events.length}{' '}
                                                    event hint
                                                    {planInsight.events
                                                        .length === 1
                                                        ? ''
                                                        : 's'}
                                                </Badge>
                                            </div>
                                            {planInsight.bullets[1] && (
                                                <p className="rounded-md bg-background/70 p-2 text-[11px] leading-relaxed text-muted-foreground">
                                                    {planInsight.bullets[1]}
                                                </p>
                                            )}
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-8 w-full border-vibrant-blue/40 bg-background/80 text-vibrant-blue hover:bg-vibrant-blue/10"
                                                    >
                                                        <Info className="mr-2 h-3.5 w-3.5" />
                                                        Explore travel pulse
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent
                                                    align="start"
                                                    className="w-[min(24rem,calc(100vw-2rem))] space-y-2 border-vibrant-blue/30 bg-background p-3 text-xs text-muted-foreground"
                                                >
                                                    <p className="font-medium uppercase tracking-[0.12em] text-vibrant-blue/80">
                                                        AI schedule context
                                                    </p>
                                                    {planInsight.bullets.map(
                                                        insight => (
                                                            <p
                                                                key={insight}
                                                                className="leading-relaxed"
                                                            >
                                                                • {insight}
                                                            </p>
                                                        )
                                                    )}
                                                    {planInsight.events.length >
                                                    0 ? (
                                                        <div className="space-y-1 pt-1">
                                                            <p className="font-medium text-vibrant-blue/80">
                                                                PH • AU • US
                                                                event hints
                                                            </p>
                                                            {planInsight.events.map(
                                                                event => (
                                                                    <p
                                                                        key={
                                                                            event
                                                                        }
                                                                        className="leading-relaxed"
                                                                    >
                                                                        •{' '}
                                                                        {event}
                                                                    </p>
                                                                )
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <p className="leading-relaxed">
                                                            • No additional
                                                            public event data
                                                            found beyond your
                                                            registered company
                                                            holidays.
                                                        </p>
                                                    )}
                                                </PopoverContent>
                                            </Popover>
                                        </div>
                                        <Button
                                            variant="outline"
                                            className="w-full whitespace-nowrap"
                                            onClick={() => {
                                                setSelectedPlanKey(planKey)
                                                onSelectPlan({
                                                    leaveTypeId,
                                                    startDate: planStart,
                                                    endDate: planEnd,
                                                    message: `Planned leave from ${format(plan.startDate, 'MMM d')} to ${format(plan.endDate, 'MMM d, yyyy')} using the Smart Leave Planner.`,
                                                })
                                            }}
                                        >
                                            <CheckCircle2 className="mr-2 h-4 w-4" />
                                            Review request
                                        </Button>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
