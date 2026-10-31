import { useMemo, useState } from 'react'
import {
    CalendarDays,
    CheckCircle2,
    ExternalLink,
    Search,
    Sparkles,
    WandSparkles,
} from 'lucide-react'
import { format, addMonths, startOfMonth } from 'date-fns'
import { generateLeavePlans, filterLeavePlans } from '../leave-plans.mjs'
import {
    buildLeaveSearchLinks,
    leaveSearchCountries,
} from '../leave-search.mjs'
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

const dateKey = (date: Date) => format(date, 'yyyy-MM-dd')

export function SmartLeavePlanner({
    leaveTypes,
    holidays,
    requests,
    onSelectPlan,
}: SmartLeavePlannerProps) {
    const [leaveTypeId, setLeaveTypeId] = useState('')
    const [hasGenerated, setHasGenerated] = useState(false)
    const [monthFilter, setMonthFilter] = useState('all')
    const [holidayFilter, setHolidayFilter] = useState('all')
    const [sortBy, setSortBy] = useState('best')
    const [page, setPage] = useState(0)
    const [selectedPlanKey, setSelectedPlanKey] = useState('')
    const [searchCountry, setSearchCountry] = useState('PH')

    const selectedLeaveType = leaveTypes.find(type => type.id === leaveTypeId)
    const monthOptions = useMemo(() => {
        const firstMonth = startOfMonth(new Date())
        return Array.from({ length: 7 }, (_, index) => {
            const date = addMonths(firstMonth, index)
            return {
                value: format(date, 'yyyy-MM'),
                label: format(date, 'MMMM yyyy'),
            }
        })
    }, [])
    const allPlans = useMemo<SuggestedPlan[]>(() => {
        if (!hasGenerated || !selectedLeaveType) return []
        return generateLeavePlans({
            credits: selectedLeaveType.credits,
            holidays,
            requests,
        })
    }, [hasGenerated, selectedLeaveType, holidays, requests])
    const matchingPlans = useMemo<SuggestedPlan[]>(
        () =>
            filterLeavePlans(allPlans, {
                month: monthFilter,
                holidayOnly: holidayFilter === 'holidays',
                sort: sortBy,
            }),
        [allPlans, monthFilter, holidayFilter, sortBy]
    )
    const pageCount = Math.ceil(matchingPlans.length / 3)
    const currentPage = Math.min(page, Math.max(0, pageCount - 1))
    // Keep recommendation pages short on mobile.
    const plans = useMemo(
        () => matchingPlans.slice(currentPage * 3, currentPage * 3 + 3),
        [matchingPlans, currentPage]
    )

    const handleGenerate = () => {
        setPage(0)
        setSelectedPlanKey('')
        setHasGenerated(true)
    }

    return (
        <Card className="border-vibrant-purple/30 bg-gradient-to-br from-vibrant-purple/5 to-vibrant-blue/5">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-vibrant-purple" />
                    Pulse Smart Leave Planner
                </CardTitle>
                <CardDescription>
                    Find leave dates that maximize long weekends and avoid
                    conflicts with your existing requests. Browse schedules from
                    tomorrow through the next 6 months.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                    <div className="min-w-0 space-y-2">
                        <Label htmlFor="planner-leave-type">Leave type</Label>
                        <Select
                            value={leaveTypeId}
                            onValueChange={value => {
                                setLeaveTypeId(value)
                                setHasGenerated(false)
                                setSelectedPlanKey('')
                                setPage(0)
                            }}
                        >
                            <SelectTrigger
                                id="planner-leave-type"
                                className="w-full"
                            >
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
                        disabled={
                            !selectedLeaveType || selectedLeaveType.credits < 1
                        }
                        className="w-full whitespace-nowrap bg-vibrant-purple hover:bg-vibrant-purple/90 md:w-auto"
                    >
                        <WandSparkles className="mr-2 h-4 w-4" />
                        Find dates
                    </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="min-w-0 space-y-2">
                        <Label htmlFor="planner-month">Start month</Label>
                        <Select
                            value={monthFilter}
                            onValueChange={value => {
                                setMonthFilter(value)
                                setPage(0)
                            }}
                        >
                            <SelectTrigger
                                id="planner-month"
                                className="w-full"
                            >
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">
                                    Next 6 months (all dates)
                                </SelectItem>
                                {monthOptions.map(month => (
                                    <SelectItem
                                        key={month.value}
                                        value={month.value}
                                    >
                                        {month.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="min-w-0 space-y-2">
                        <Label htmlFor="planner-holidays">
                            Holiday preference
                        </Label>
                        <Select
                            value={holidayFilter}
                            onValueChange={value => {
                                setHolidayFilter(value)
                                setPage(0)
                            }}
                        >
                            <SelectTrigger
                                id="planner-holidays"
                                className="w-full"
                            >
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">
                                    All schedules
                                </SelectItem>
                                <SelectItem value="holidays">
                                    Includes a holiday
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="min-w-0 space-y-2 sm:col-span-2">
                        <Label htmlFor="planner-sort">
                            Sort recommendations
                        </Label>
                        <Select
                            value={sortBy}
                            onValueChange={value => {
                                setSortBy(value)
                                setPage(0)
                            }}
                        >
                            <SelectTrigger id="planner-sort" className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="best">
                                    Most time off
                                </SelectItem>
                                <SelectItem value="soonest">
                                    Soonest first
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <p className="text-xs text-muted-foreground">
                    All suggested schedules start and end within the next 6
                    months. Month filters use the schedule’s start date.
                </p>
                {hasGenerated && matchingPlans.length === 0 && (
                    <p
                        className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground"
                        role="status"
                    >
                        {!selectedLeaveType || selectedLeaveType.credits < 1
                            ? 'Choose a leave type with available credits to generate recommendations.'
                            : 'No available schedules match these filters. Try another month or choose all schedules.'}
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
                                {matchingPlans.length} options
                            </Badge>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="planner-search-country">
                                Explore country
                            </Label>
                            <Select
                                value={searchCountry}
                                onValueChange={setSearchCountry}
                            >
                                <SelectTrigger
                                    id="planner-search-country"
                                    className="w-full"
                                >
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {leaveSearchCountries.map(country => (
                                        <SelectItem
                                            key={country.code}
                                            value={country.code}
                                        >
                                            {country.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                                Open Google results for each schedule’s dates
                                and selected country. Confirm event dates on the
                                organizer’s website.
                            </p>
                        </div>
                        <p
                            className="text-xs text-muted-foreground"
                            aria-live="polite"
                        >
                            Showing {currentPage * 3 + 1}–
                            {Math.min(
                                currentPage * 3 + 3,
                                matchingPlans.length
                            )}{' '}
                            of {matchingPlans.length} schedules
                        </p>
                        {plans.map(plan => {
                            const planStart = dateKey(plan.startDate)
                            const planEnd = dateKey(plan.endDate)
                            const planKey = `${planStart}-${planEnd}`
                            const searchLinks = buildLeaveSearchLinks({
                                startDate: plan.startDate,
                                endDate: plan.endDate,
                                countryCode: searchCountry,
                            })
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
                                    </div>
                                    <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-vibrant-blue/20 bg-gradient-to-b from-vibrant-blue/10 to-vibrant-blue/5 p-3">
                                        <div className="space-y-2.5">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-vibrant-blue/90">
                                                Explore your trip
                                            </p>
                                            <p className="text-sm text-muted-foreground">
                                                Use {plan.leaveCreditsUsed}{' '}
                                                leave{' '}
                                                {plan.leaveCreditsUsed === 1
                                                    ? 'credit'
                                                    : 'credits'}{' '}
                                                for {plan.spanDays} days away,
                                                including {plan.weekendDays}{' '}
                                                weekend{' '}
                                                {plan.weekendDays === 1
                                                    ? 'day'
                                                    : 'days'}
                                                .
                                            </p>
                                            <div
                                                className="grid gap-2"
                                                aria-label="Google searches for this schedule"
                                            >
                                                {searchLinks.map(link => (
                                                    <Button
                                                        key={link.label}
                                                        asChild
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-auto min-h-9 w-full justify-start whitespace-normal border-vibrant-blue/30 bg-background/80 text-vibrant-blue"
                                                    >
                                                        <a
                                                            href={link.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            referrerPolicy="no-referrer"
                                                            aria-label={`${link.label} in ${link.country} on Google, ${format(plan.startDate, 'MMM d, yyyy')} to ${format(plan.endDate, 'MMM d, yyyy')} (opens in a new tab)`}
                                                        >
                                                            <Search className="h-3.5 w-3.5 shrink-0" />
                                                            <span className="min-w-0 flex-1 text-left">
                                                                {link.label}
                                                            </span>
                                                            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                                                        </a>
                                                    </Button>
                                                ))}
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                Searches open in a new tab.
                                                Country selection applies to
                                                searches only.
                                            </p>
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
                        {pageCount > 1 && (
                            <div
                                className="flex items-center justify-between gap-2"
                                aria-label="Recommendation pages"
                            >
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={currentPage === 0}
                                    onClick={() => setPage(currentPage - 1)}
                                >
                                    Previous
                                </Button>
                                <span className="text-xs text-muted-foreground">
                                    {currentPage + 1} / {pageCount}
                                </span>
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={currentPage + 1 >= pageCount}
                                    onClick={() => setPage(currentPage + 1)}
                                >
                                    Next options
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
