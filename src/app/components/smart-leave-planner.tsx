import { useMemo, useState } from 'react'
import {
    CalendarDays,
    CheckCircle2,
    Sparkles,
    WandSparkles,
} from 'lucide-react'
import { format, addDays, isWeekend } from 'date-fns'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from './ui/card'
import { Input } from './ui/input'
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
    calendarDays: number
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
    const [duration, setDuration] = useState('5')
    const [leaveTypeId, setLeaveTypeId] = useState('')
    const [hasGenerated, setHasGenerated] = useState(false)
    const [selectedPlanKey, setSelectedPlanKey] = useState('')

    const selectedLeaveType = leaveTypes.find(type => type.id === leaveTypeId)
    const holidayByDate = useMemo(
        () => new Map(holidays.map(holiday => [holiday.date, holiday.name])),
        [holidays]
    )

    const plans = useMemo<SuggestedPlan[]>(() => {
        if (!hasGenerated || !selectedLeaveType) {
            return []
        }

        const requestedDays = Number(duration)
        if (
            !Number.isInteger(requestedDays) ||
            requestedDays < 1 ||
            requestedDays > selectedLeaveType.credits
        ) {
            return []
        }

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
            const endDate = addDays(startDate, requestedDays - 1)
            const startKey = dateKey(startDate)
            const endKey = dateKey(endDate)
            const overlapsExistingRequest = blockedRanges.some(
                range => startKey <= range.end && endKey >= range.start
            )

            if (overlapsExistingRequest) {
                continue
            }

            const holidayNames: string[] = []
            let weekendDays = 0
            for (let index = 0; index < requestedDays; index += 1) {
                const currentDate = addDays(startDate, index)
                if (isWeekend(currentDate)) {
                    weekendDays += 1
                }
                const holidayName = holidayByDate.get(dateKey(currentDate))
                if (holidayName) {
                    holidayNames.push(holidayName)
                }
            }

            candidates.push({
                startDate,
                endDate,
                calendarDays: requestedDays,
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
        duration,
        hasGenerated,
        holidayByDate,
        leaveTypeId,
        requests,
        selectedLeaveType,
    ])

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
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
                    <div className="min-w-0 space-y-2">
                        <Label htmlFor="leave-planner-duration">
                            Days away
                        </Label>
                        <Input
                            id="leave-planner-duration"
                            type="number"
                            min={1}
                            max={selectedLeaveType?.credits || 30}
                            value={duration}
                            onChange={event => {
                                setDuration(event.target.value)
                                setHasGenerated(false)
                                setSelectedPlanKey('')
                            }}
                        />
                    </div>
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
                    </div>
                    <Button
                        onClick={handleGenerate}
                        disabled={!selectedLeaveType || !duration}
                        className="w-full whitespace-nowrap bg-vibrant-purple hover:bg-vibrant-purple/90 md:w-auto"
                    >
                        <WandSparkles className="mr-2 h-4 w-4" />
                        Find dates
                    </Button>
                </div>

                {hasGenerated && plans.length === 0 && (
                    <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                        Enter a duration within your available credits and
                        choose a leave type to generate recommendations.
                    </p>
                )}

                {plans.length > 0 && (
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm font-medium">
                            <CalendarDays className="h-4 w-4 text-vibrant-blue" />
                            Recommended schedules
                        </div>
                        {plans.map(plan => {
                            const planStart = dateKey(plan.startDate)
                            const planEnd = dateKey(plan.endDate)
                            const planKey = `${planStart}-${planEnd}`
                            const isSelected = selectedPlanKey === planKey
                            return (
                                <div
                                    key={planKey}
                                    className={`grid gap-3 rounded-lg border p-3 transition-colors sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start ${
                                        isSelected
                                            ? 'border-vibrant-purple bg-vibrant-purple/10'
                                            : 'bg-background/80'
                                    }`}
                                >
                                    <div className="min-w-0">
                                        <p className="font-medium">
                                            {format(plan.startDate, 'MMM d')} –{' '}
                                            {format(
                                                plan.endDate,
                                                'MMM d, yyyy'
                                            )}
                                        </p>
                                        <div className="mt-1 flex flex-wrap gap-2">
                                            <Badge variant="outline">
                                                {plan.calendarDays} credits
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
                                    <Button
                                        variant="outline"
                                        className="w-full whitespace-nowrap sm:w-auto"
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
                            )
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
