import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../ui/select'
// @ts-ignore
import logoImage from 'figma:asset/80b7a2d7f7164e79d1aa41e678d57bd410cbb0ae.png'
import {
    Users,
    Clock,
    FileText,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    ArrowUpDown,
    Filter,
    Calendar as CalendarIcon,
    Eye,
    CheckCircle,
    XCircle,
    AlertCircle,
    Paperclip,
    Download,
    UserCheck,
} from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { toast } from 'sonner'
import {
    getEmployees,
    replaceEmployees,
    Employee,
    syncEmployeesWithEmploymentOptions,
} from '../employee-data'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '../ui/dialog'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '../ui/alert-dialog'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import { format } from 'date-fns'
import { AdjustmentRequestsSection } from '../adjustment-requests-section'

const ITEMS_PER_PAGE = 10

interface LogEntry {
    status: 'pending' | 'approved' | 'denied' | 'cancelled'
    date: Date
    approvedBy?: string
    reason?: string
}

interface LeaveRequest {
    id: string
    employeeId: string
    employeeName: string
    position: string
    department: string
    leaveType: string
    startDate: Date
    endDate: Date
    message: string
    status: 'approved' | 'denied' | 'pending' | 'cancelled'
    submittedDate: Date
    attachments: string[]
    logTrail: LogEntry[]
}

interface LeaveRequestApiLog {
    status: 'pending' | 'approved' | 'denied' | 'cancelled'
    loggedAt: string
    approvedBy?: string | null
    reason?: string | null
}

interface LeaveRequestApiAttachment {
    fileName: string
}

interface LeaveRequestApiRow {
    request_id: string
    employee_id: string
    employee_name: string
    position: string
    department: string
    leave_type_name: string
    start_date: string
    end_date: string
    message: string
    status: 'pending' | 'approved' | 'denied' | 'cancelled'
    submitted_at: string
    attachments?: LeaveRequestApiAttachment[]
    logs?: LeaveRequestApiLog[]
}

interface DashboardPageProps {
    apiBaseUrl: string
    accessToken: string
    employmentOptions: {
        employmentTypes: string[]
        departments: Array<{ departmentId: number; name: string }>
        positions: Array<{
            positionId: number
            departmentId: number
            name: string
        }>
    }
}

export function DashboardPage({
    apiBaseUrl,
    accessToken,
    employmentOptions,
}: DashboardPageProps) {
    const getTodayIsoDate = () => {
        const now = new Date()
        const year = now.getFullYear()
        const month = String(now.getMonth() + 1).padStart(2, '0')
        const day = String(now.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
    }

    const getNowDateTimeLocal = () => {
        const now = new Date()
        const year = now.getFullYear()
        const month = String(now.getMonth() + 1).padStart(2, '0')
        const day = String(now.getDate()).padStart(2, '0')
        const hour = String(now.getHours()).padStart(2, '0')
        const minute = String(now.getMinutes()).padStart(2, '0')
        return `${year}-${month}-${day}T${hour}:${minute}`
    }

    const toDateOnly = (value: string) => value.slice(0, 10)

    const toDateTimeAtStartOfDay = (dateValue: string) => `${dateValue}T00:00`
    const toDateTimeAtEndOfDay = (dateValue: string) => `${dateValue}T23:59`

    const [employees, setEmployees] = useState<Employee[]>(() => getEmployees())
    const [currentPage, setCurrentPage] = useState(1)
    const [fromDate, setFromDate] = useState<string>(() =>
        toDateTimeAtStartOfDay(getTodayIsoDate())
    )
    const [toDate, setToDate] = useState<string>(() =>
        toDateTimeAtEndOfDay(getTodayIsoDate())
    )
    const [sortBy, setSortBy] = useState<'name' | 'department' | 'status'>(
        'name'
    )
    const [filterStatus, setFilterStatus] = useState<
        'all' | Employee['status']
    >('all')
    const [logoBase64, setLogoBase64] = useState<string>('')
    const [maxSelectableDateTime, setMaxSelectableDateTime] = useState<string>(
        () => getNowDateTimeLocal()
    )

    useEffect(() => {
        setMaxSelectableDateTime(getNowDateTimeLocal())
    }, [])

    // Collapsible card states
    const [isEmployeeStatusOpen, setIsEmployeeStatusOpen] = useState(false)
    const [isLeaveRequestsOpen, setIsLeaveRequestsOpen] = useState(false)
    const [isAdjustmentRequestsOpen, setIsAdjustmentRequestsOpen] =
        useState(false)

    // Adjustment requests counter
    const [adjustmentRequestsCount, setAdjustmentRequestsCount] = useState(0)
    const [adjustmentFilterStatus, setAdjustmentFilterStatus] = useState<
        'all' | 'pending' | 'approved' | 'denied' | 'cancelled'
    >(() => {
        const fallbackValue:
            'all' | 'pending' | 'approved' | 'denied' | 'cancelled' = 'pending'
        if (typeof window === 'undefined') {
            return fallbackValue
        }

        const saved = window.localStorage.getItem(
            'wfh-pulse:dashboard:adjustment-filter-status'
        )
        if (
            saved === 'all' ||
            saved === 'pending' ||
            saved === 'approved' ||
            saved === 'denied' ||
            saved === 'cancelled'
        ) {
            return saved
        }

        return fallbackValue
    })

    useEffect(() => {
        if (typeof window === 'undefined') {
            return
        }

        window.localStorage.setItem(
            'wfh-pulse:dashboard:adjustment-filter-status',
            adjustmentFilterStatus
        )
    }, [adjustmentFilterStatus])

    useEffect(() => {
        const loadAdjustmentRequestCount = async () => {
            if (!accessToken) {
                setAdjustmentRequestsCount(0)
                return
            }

            try {
                const queryParams = new URLSearchParams({
                    sourcePage: 'all',
                })
                if (adjustmentFilterStatus !== 'all') {
                    queryParams.set('status', adjustmentFilterStatus)
                }

                const response = await fetch(
                    `${apiBaseUrl}/hr/adjustment-requests?${queryParams.toString()}`,
                    {
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                        },
                    }
                )

                if (!response.ok) {
                    setAdjustmentRequestsCount(0)
                    return
                }

                const body = await response.json().catch(() => null)
                const rows = Array.isArray(body?.requests) ? body.requests : []
                setAdjustmentRequestsCount(rows.length)
            } catch {
                setAdjustmentRequestsCount(0)
            }
        }

        void loadAdjustmentRequestCount()
    }, [accessToken, adjustmentFilterStatus, apiBaseUrl])

    // Convert logo to base64 for PDF embedding
    useEffect(() => {
        const convertImageToBase64 = async () => {
            try {
                const response = await fetch(logoImage)
                const blob = await response.blob()
                const reader = new FileReader()
                reader.onloadend = () => {
                    setLogoBase64(reader.result as string)
                }
                reader.readAsDataURL(blob)
            } catch (error) {
                console.error('Failed to convert logo to base64:', error)
            }
        }
        convertImageToBase64()
    }, [])

    useEffect(() => {
        const formatWorkDuration = (minutes: number | null | undefined) => {
            if (minutes == null || !Number.isFinite(Number(minutes))) {
                return undefined
            }

            const totalMinutes = Math.max(0, Number(minutes))
            const hours = Math.floor(totalMinutes / 60)
            const remainingMinutes = totalMinutes % 60
            return `${hours}h ${String(remainingMinutes).padStart(2, '0')}m`
        }

        const mapApiEmployeeToLocal = (row: Record<string, any>): Employee => ({
            id: String(row.employee_id),
            employeeId: String(row.employee_code ?? row.employee_id),
            firstName: String(row.first_name ?? ''),
            lastName: String(row.last_name ?? ''),
            status: (row.attendance_status ?? 'present') as Employee['status'],
            statusDate: row.status_date
                ? String(row.status_date).slice(0, 10)
                : undefined,
            employmentStatus: (row.employment_status ??
                'active') as Employee['employmentStatus'],
            employmentType: String(row.employment_type ?? 'full-time'),
            clockInTime: row.clock_in
                ? String(row.clock_in).slice(0, 5)
                : undefined,
            clockOutTime: row.clock_out
                ? String(row.clock_out).slice(0, 5)
                : undefined,
            workDuration: formatWorkDuration(row.work_duration_minutes),
            lateMinutes:
                row.late_minutes == null ? undefined : Number(row.late_minutes),
            isOnBreak: Boolean(row.active_break_started_at),
            department: String(row.department ?? ''),
            position: row.position ? String(row.position) : '',
            email: row.email ? String(row.email) : '',
            phone: row.phone ? String(row.phone) : '',
            joinDate: row.join_date ? String(row.join_date).slice(0, 10) : '',
            birthday: row.birthday ? String(row.birthday).slice(0, 10) : '',
            gender: row.gender
                ? (String(row.gender) as Employee['gender'])
                : undefined,
            nationality: row.nationality ? String(row.nationality) : '',
            maritalStatus: row.marital_status
                ? (String(row.marital_status) as Employee['maritalStatus'])
                : undefined,
            address: row.address ? String(row.address) : '',
            invitationSentDate: row.invitation_sent_date
                ? String(row.invitation_sent_date).slice(0, 10)
                : undefined,
            passwordChanged:
                row.password_changed == null
                    ? undefined
                    : Boolean(row.password_changed),
            profilePicture: row.profile_picture_url
                ? String(row.profile_picture_url)
                : undefined,
        })

        const loadEmployees = async () => {
            if (!accessToken) {
                return
            }

            try {
                const queryParams = new URLSearchParams()
                if (fromDate) {
                    queryParams.set('from', toDateOnly(fromDate))
                }
                if (toDate) {
                    queryParams.set('to', toDateOnly(toDate))
                }

                const endpoint =
                    queryParams.size > 0
                        ? `${apiBaseUrl}/employees?${queryParams.toString()}`
                        : `${apiBaseUrl}/employees`

                const response = await fetch(endpoint, {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                })

                if (!response.ok) {
                    return
                }

                const payload = await response.json().catch(() => ({}))
                const rows = Array.isArray(payload?.employees)
                    ? payload.employees
                    : []
                const mappedEmployees = rows.map(mapApiEmployeeToLocal)
                setEmployees(mappedEmployees)
                replaceEmployees(mappedEmployees)
            } catch {
                // Keep local cache values when API is unavailable.
            }
        }

        void loadEmployees()
    }, [accessToken, apiBaseUrl, fromDate, toDate])

    const handleFromDateChange = (value: string) => {
        if (!value) {
            return
        }

        const clampedValue =
            value > maxSelectableDateTime ? maxSelectableDateTime : value

        setFromDate(clampedValue)
        if (toDate && clampedValue > toDate) {
            setToDate(clampedValue)
        }
        setCurrentPage(1)
    }

    const handleToDateChange = (value: string) => {
        if (!value) {
            return
        }

        const clampedValue =
            value > maxSelectableDateTime ? maxSelectableDateTime : value

        setToDate(clampedValue)
        if (fromDate && clampedValue < fromDate) {
            setFromDate(clampedValue)
        }
        setCurrentPage(1)
    }

    const resetDateRangeToToday = () => {
        const today = getTodayIsoDate()
        setFromDate(toDateTimeAtStartOfDay(today))
        setToDate(toDateTimeAtEndOfDay(today))
        setCurrentPage(1)
    }

    const employeesWithSyncedMeta = useMemo(() => {
        return syncEmployeesWithEmploymentOptions(employees, employmentOptions)
    }, [employees, employmentOptions])

    const statusValues = useMemo(() => {
        const unique = new Set<Employee['status']>()
        for (const employee of employeesWithSyncedMeta) {
            unique.add(employee.status)
        }

        const preferredOrder: Employee['status'][] = [
            'present',
            'on-leave',
            'absent',
        ]

        return preferredOrder.filter(status => unique.has(status))
    }, [employeesWithSyncedMeta])

    const statusSummaryGridClassName = useMemo(() => {
        const count = statusValues.length

        if (count <= 1) {
            return 'grid grid-cols-1 gap-3'
        }

        if (count === 2) {
            return 'grid grid-cols-2 gap-3'
        }

        if (count === 3) {
            return 'grid grid-cols-1 sm:grid-cols-3 gap-3'
        }

        if (count === 4) {
            return 'grid grid-cols-2 sm:grid-cols-4 gap-3'
        }

        return 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3'
    }, [statusValues.length])

    const formatStatusLabel = (status: Employee['status']) =>
        status
            .split('-')
            .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1))
            .join(' ')

    const getStatusSummaryClasses = (status: Employee['status']) => {
        switch (status) {
            case 'present':
                return {
                    container: 'bg-vibrant-green/10',
                    text: 'text-vibrant-green',
                }
            case 'on-leave':
                return {
                    container: 'bg-vibrant-orange/10',
                    text: 'text-vibrant-orange',
                }
            case 'absent':
                return {
                    container: 'bg-destructive/10',
                    text: 'text-destructive',
                }
        }
    }

    // Leave requests state
    const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([
        // Pending requests (5)
        {
            id: 'lr-001',
            employeeId: 'emp-1',
            employeeName: 'Sarah Johnson',
            position: 'Marketing Manager',
            department: 'Marketing',
            leaveType: 'Vacation Leave',
            startDate: new Date(2025, 9, 20),
            endDate: new Date(2025, 9, 24),
            message: 'Family vacation to Hawaii',
            status: 'pending',
            submittedDate: new Date(2025, 9, 15),
            attachments: ['flight-tickets.pdf'],
            logTrail: [{ status: 'pending', date: new Date(2025, 9, 15) }],
        },
        {
            id: 'lr-002',
            employeeId: 'emp-5',
            employeeName: 'Michael Chen',
            position: 'Financial Analyst',
            department: 'Finance',
            leaveType: 'Sick Leave',
            startDate: new Date(2025, 9, 18),
            endDate: new Date(2025, 9, 18),
            message: 'Medical appointment for regular checkup',
            status: 'pending',
            submittedDate: new Date(2025, 9, 16),
            attachments: ['medical-certificate.pdf'],
            logTrail: [{ status: 'pending', date: new Date(2025, 9, 16) }],
        },
        {
            id: 'lr-003',
            employeeId: 'emp-8',
            employeeName: 'Emily Rodriguez',
            position: 'UI/UX Designer',
            department: 'Design',
            leaveType: 'Emergency Leave',
            startDate: new Date(2025, 9, 19),
            endDate: new Date(2025, 9, 21),
            message: 'Family emergency - urgent matter',
            status: 'pending',
            submittedDate: new Date(2025, 9, 17),
            attachments: [],
            logTrail: [{ status: 'pending', date: new Date(2025, 9, 17) }],
        },
        {
            id: 'lr-004',
            employeeId: 'emp-12',
            employeeName: 'David Kim',
            position: 'Sales Representative',
            department: 'Sales',
            leaveType: 'Paternity Leave',
            startDate: new Date(2025, 9, 25),
            endDate: new Date(2025, 9, 30),
            message: 'Welcoming our new baby',
            status: 'pending',
            submittedDate: new Date(2025, 9, 14),
            attachments: ['birth-certificate.pdf'],
            logTrail: [{ status: 'pending', date: new Date(2025, 9, 14) }],
        },
        {
            id: 'lr-005',
            employeeId: 'emp-15',
            employeeName: 'Jessica Taylor',
            position: 'HR Specialist',
            department: 'HR',
            leaveType: 'Compensatory Time Off',
            startDate: new Date(2025, 9, 22),
            endDate: new Date(2025, 9, 23),
            message: 'Overtime compensation for weekend work',
            status: 'pending',
            submittedDate: new Date(2025, 9, 16),
            attachments: ['overtime-log.pdf'],
            logTrail: [{ status: 'pending', date: new Date(2025, 9, 16) }],
        },
        // Approved requests (3)
        {
            id: 'lr-006',
            employeeId: 'emp-3',
            employeeName: 'James Wilson',
            position: 'Senior Developer',
            department: 'Engineering',
            leaveType: 'Vacation Leave',
            startDate: new Date(2025, 8, 25),
            endDate: new Date(2025, 8, 29),
            message: 'Annual family reunion',
            status: 'approved',
            submittedDate: new Date(2025, 8, 10),
            attachments: ['itinerary.pdf'],
            logTrail: [
                { status: 'pending', date: new Date(2025, 8, 10) },
                {
                    status: 'approved',
                    date: new Date(2025, 8, 12),
                    approvedBy: 'Sarah Martinez',
                },
            ],
        },
        {
            id: 'lr-007',
            employeeId: 'emp-7',
            employeeName: 'Lisa Anderson',
            position: 'Support Agent',
            department: 'Customer Support',
            leaveType: 'Sick Leave',
            startDate: new Date(2025, 9, 10),
            endDate: new Date(2025, 9, 12),
            message: 'Recovering from flu',
            status: 'approved',
            submittedDate: new Date(2025, 9, 9),
            attachments: ['medical-cert.pdf'],
            logTrail: [
                { status: 'pending', date: new Date(2025, 9, 9) },
                {
                    status: 'approved',
                    date: new Date(2025, 9, 9),
                    approvedBy: 'Michael Chen',
                },
            ],
        },
        {
            id: 'lr-008',
            employeeId: 'emp-10',
            employeeName: 'Robert Martinez',
            position: 'Product Manager',
            department: 'Product',
            leaveType: 'Bereavement Leave',
            startDate: new Date(2025, 8, 20),
            endDate: new Date(2025, 8, 22),
            message: 'Funeral arrangements for family member',
            status: 'approved',
            submittedDate: new Date(2025, 8, 18),
            attachments: ['death-certificate.pdf'],
            logTrail: [
                { status: 'pending', date: new Date(2025, 8, 18) },
                {
                    status: 'approved',
                    date: new Date(2025, 8, 18),
                    approvedBy: 'Sarah Martinez',
                },
            ],
        },
        // Denied requests (3)
        {
            id: 'lr-009',
            employeeId: 'emp-4',
            employeeName: 'Jennifer Lee',
            position: 'Marketing Manager',
            department: 'Marketing',
            leaveType: 'Vacation Leave',
            startDate: new Date(2025, 9, 20),
            endDate: new Date(2025, 9, 27),
            message: 'Extended vacation trip',
            status: 'denied',
            submittedDate: new Date(2025, 9, 5),
            attachments: [],
            logTrail: [
                { status: 'pending', date: new Date(2025, 9, 5) },
                {
                    status: 'denied',
                    date: new Date(2025, 9, 7),
                    approvedBy: 'Michael Chen',
                    reason: 'Insufficient leave credits. Only 5 days available, 8 days requested.',
                },
            ],
        },
        {
            id: 'lr-010',
            employeeId: 'emp-9',
            employeeName: 'Daniel Thompson',
            position: 'Product Manager',
            department: 'Product',
            leaveType: 'Emergency Leave',
            startDate: new Date(2025, 8, 15),
            endDate: new Date(2025, 8, 18),
            message: 'Personal matter',
            status: 'denied',
            submittedDate: new Date(2025, 8, 14),
            attachments: [],
            logTrail: [
                { status: 'pending', date: new Date(2025, 8, 14) },
                {
                    status: 'denied',
                    date: new Date(2025, 8, 14),
                    approvedBy: 'Sarah Martinez',
                    reason: 'Emergency leave requires supporting documentation. Please provide necessary documents.',
                },
            ],
        },
        {
            id: 'lr-011',
            employeeId: 'emp-13',
            employeeName: 'Amanda White',
            position: 'HR Specialist',
            department: 'HR',
            leaveType: 'Compensatory Time Off',
            startDate: new Date(2025, 9, 8),
            endDate: new Date(2025, 9, 9),
            message: 'Overtime compensation request',
            status: 'denied',
            submittedDate: new Date(2025, 9, 1),
            attachments: [],
            logTrail: [
                { status: 'pending', date: new Date(2025, 9, 1) },
                {
                    status: 'denied',
                    date: new Date(2025, 9, 2),
                    approvedBy: 'Michael Chen',
                    reason: 'No overtime records found for the requested period. Please verify with your supervisor.',
                },
            ],
        },
        // Cancelled requests (3)
        {
            id: 'lr-012',
            employeeId: 'emp-2',
            employeeName: 'John Smith',
            position: 'Senior Developer',
            department: 'Engineering',
            leaveType: 'Vacation Leave',
            startDate: new Date(2025, 9, 15),
            endDate: new Date(2025, 9, 17),
            message: 'Short vacation trip',
            status: 'cancelled',
            submittedDate: new Date(2025, 8, 25),
            attachments: [],
            logTrail: [
                { status: 'pending', date: new Date(2025, 8, 25) },
                {
                    status: 'approved',
                    date: new Date(2025, 8, 26),
                    approvedBy: 'Sarah Martinez',
                },
                {
                    status: 'cancelled',
                    date: new Date(2025, 9, 10),
                    reason: 'Plans changed - unable to proceed with leave',
                },
            ],
        },
        {
            id: 'lr-013',
            employeeId: 'emp-6',
            employeeName: 'Karen Brown',
            position: 'Operations Coordinator',
            department: 'Operations',
            leaveType: 'Sick Leave',
            startDate: new Date(2025, 8, 30),
            endDate: new Date(2025, 8, 30),
            message: 'Medical appointment',
            status: 'cancelled',
            submittedDate: new Date(2025, 8, 20),
            attachments: [],
            logTrail: [
                { status: 'pending', date: new Date(2025, 8, 20) },
                {
                    status: 'cancelled',
                    date: new Date(2025, 8, 28),
                    reason: 'Appointment rescheduled to a later date',
                },
            ],
        },
        {
            id: 'lr-014',
            employeeId: 'emp-11',
            employeeName: 'Christopher Davis',
            position: 'Sales Representative',
            department: 'Sales',
            leaveType: 'Emergency Leave',
            startDate: new Date(2025, 8, 12),
            endDate: new Date(2025, 8, 13),
            message: 'Urgent personal matter',
            status: 'cancelled',
            submittedDate: new Date(2025, 8, 8),
            attachments: [],
            logTrail: [
                { status: 'pending', date: new Date(2025, 8, 8) },
                {
                    status: 'approved',
                    date: new Date(2025, 8, 9),
                    approvedBy: 'Michael Chen',
                },
                {
                    status: 'cancelled',
                    date: new Date(2025, 8, 11),
                    reason: 'Matter resolved - no longer need leave',
                },
            ],
        },
    ])

    const [leaveFilterStatus, setLeaveFilterStatus] = useState<
        'all' | 'pending' | 'approved' | 'denied' | 'cancelled'
    >(() => {
        const fallbackValue:
            'all' | 'pending' | 'approved' | 'denied' | 'cancelled' = 'pending'
        if (typeof window === 'undefined') {
            return fallbackValue
        }

        const saved = window.localStorage.getItem(
            'wfh-pulse:dashboard:leave-filter-status'
        )
        if (
            saved === 'all' ||
            saved === 'pending' ||
            saved === 'approved' ||
            saved === 'denied' ||
            saved === 'cancelled'
        ) {
            return saved
        }

        return fallbackValue
    })
    const [selectedLeaveRequest, setSelectedLeaveRequest] =
        useState<LeaveRequest | null>(null)
    const [showLeaveDetailsDialog, setShowLeaveDetailsDialog] = useState(false)
    const [showApproveDialog, setShowApproveDialog] = useState(false)
    const [showDenyDialog, setShowDenyDialog] = useState(false)
    const [showCancelApprovedDialog, setShowCancelApprovedDialog] =
        useState(false)
    const [denyReason, setDenyReason] = useState('')
    const [cancelReason, setCancelReason] = useState('')
    const [cancelAttachments, setCancelAttachments] = useState<string[]>([])
    const [isLeaveRequestsLoading, setIsLeaveRequestsLoading] = useState(false)

    // Filter employees
    const filteredEmployees = employeesWithSyncedMeta.filter(emp =>
        filterStatus === 'all' ? true : emp.status === filterStatus
    )

    // Sort employees
    const sortedEmployees = [...filteredEmployees].sort((a, b) => {
        if (sortBy === 'name') {
            return `${a.lastName}, ${a.firstName}`.localeCompare(
                `${b.lastName}, ${b.firstName}`
            )
        } else if (sortBy === 'department') {
            return a.department.localeCompare(b.department)
        } else if (sortBy === 'status') {
            const statusOrder = { present: 1, 'on-leave': 2, absent: 3 }
            return statusOrder[a.status] - statusOrder[b.status]
        }
        return 0
    })

    // Calculate pagination
    const totalPages = Math.ceil(sortedEmployees.length / ITEMS_PER_PAGE)
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
    const endIndex = startIndex + ITEMS_PER_PAGE
    const currentEmployees = sortedEmployees.slice(startIndex, endIndex)

    // Reset to page 1 when filter or sort changes
    const handleSortChange = (value: string) => {
        setSortBy(value as 'name' | 'department' | 'status')
        setCurrentPage(1)
    }

    const handleFilterChange = (value: string) => {
        setFilterStatus(value as 'all' | Employee['status'])
        setCurrentPage(1)
    }

    // Calculate statistics
    const stats = employeesWithSyncedMeta.reduce(
        (acc, emp) => {
            acc[emp.status]++
            return acc
        },
        { present: 0, 'on-leave': 0, absent: 0 }
    )

    const exportedStats = sortedEmployees.reduce(
        (acc, emp) => {
            acc[emp.status]++
            return acc
        },
        { present: 0, 'on-leave': 0, absent: 0 }
    )

    // Get current date formatted
    const getCurrentDate = () => {
        const months = [
            'January',
            'February',
            'March',
            'April',
            'May',
            'June',
            'July',
            'August',
            'September',
            'October',
            'November',
            'December',
        ]
        const today = new Date()
        return `${months[today.getMonth()]} ${today.getDate()}, ${today.getFullYear()}`
    }

    const handlePreviousPage = () => {
        if (currentPage > 1) {
            setCurrentPage(currentPage - 1)
        }
    }

    const handleNextPage = () => {
        if (currentPage < totalPages) {
            setCurrentPage(currentPage + 1)
        }
    }

    const exportToCSV = () => {
        const headers = [
            'Employee ID',
            'Last Name',
            'First Name',
            'Status Date',
            'Position',
            'Department',
            'Status',
            'Clock-In Time',
            'Clock-Out Time',
            'Work Duration',
            'Late',
        ]
        const rows = sortedEmployees.map(emp => [
            emp.employeeId,
            emp.lastName,
            emp.firstName,
            emp.statusDate || toDateOnly(toDate),
            emp.position || 'N/A',
            emp.department,
            formatStatusLabel(emp.status),
            emp.clockInTime || 'N/A',
            emp.clockOutTime ||
                (emp.status === 'present' && !emp.clockOutTime
                    ? 'Active'
                    : 'N/A'),
            emp.workDuration || 'N/A',
            emp.lateMinutes ? `${emp.lateMinutes} min` : 'No',
        ])

        const csvContent = [
            `Employee Status Report`,
            `Date: ${getCurrentDate()}`,
            ``,
            `Applied Filter: ${
                filterStatus === 'all' ? 'All' : formatStatusLabel(filterStatus)
            }`,
            `Applied Sort: ${sortBy}`,
            `Applied Date Range: ${toDateOnly(fromDate)} to ${toDateOnly(toDate)}`,
            ``,
            `Summary:`,
            `Total Employees (Result): ${sortedEmployees.length}`,
            `Present: ${exportedStats.present}`,
            `On Leave: ${exportedStats['on-leave']}`,
            `Absent: ${exportedStats.absent}`,
            ``,
            headers.join(','),
            ...rows.map(row => row.join(',')),
        ].join('\n')

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const link = document.createElement('a')
        const url = URL.createObjectURL(blob)

        link.setAttribute('href', url)
        link.setAttribute(
            'download',
            `employee-status-${new Date().toISOString().split('T')[0]}.csv`
        )
        link.style.visibility = 'hidden'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)

        toast.success('CSV report exported successfully')
    }

    const exportToPDF = () => {
        // Create a simple HTML representation for PDF
        const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Employee Status Report</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            .logo-container { text-align: center; margin-bottom: 20px; }
            .logo { width: 120px; height: auto; display: inline-block; }
            .header { margin-bottom: 20px; }
            h1 { color: #333; margin: 0 0 10px 0; font-size: 24px; }
            .date { color: #666; font-size: 14px; margin-bottom: 20px; }
            .summary { margin-bottom: 30px; padding: 15px; background: #f5f5f5; border-radius: 8px; }
            .summary-item { display: inline-block; margin-right: 30px; font-size: 14px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th { background: #333; color: white; padding: 10px 8px; text-align: left; font-size: 11px; }
            td { padding: 8px; border-bottom: 1px solid #ddd; }
            tr:nth-child(even) { background: #f9f9f9; }
            .status-present { color: #22c55e; font-weight: bold; }
            .status-on-leave { color: #f59e0b; font-weight: bold; }
            .status-absent { color: #ef4444; font-weight: bold; }
            .late-badge { background: #fef3c7; color: #f59e0b; padding: 2px 6px; border-radius: 4px; font-size: 10px; }
            .footer { margin-top: 40px; padding-top: 20px; border-top: 2px solid #e2e8f0; color: #64748b; font-size: 11px; text-align: center; line-height: 1.6; }
          </style>
        </head>
        <body>
          <div class="logo-container">
            <img src="${logoBase64 || logoImage}" alt="WFH PULSE Logo" class="logo" />
          </div>
          
          <div class="header">
            <h1>Employee Status Report</h1>
            <div class="date">Date: ${getCurrentDate()}</div>
          </div>
          <div class="summary">
            <div class="summary-item"><strong>Total Employees:</strong> ${employees.length}</div>
                        <div class="summary-item"><strong>Applied Filter:</strong> ${
                            filterStatus === 'all'
                                ? 'All'
                                : formatStatusLabel(filterStatus)
                        }</div>
                        <div class="summary-item"><strong>Applied Sort:</strong> ${sortBy}</div>
                        <div class="summary-item"><strong>Applied Date Range:</strong> ${toDateOnly(fromDate)} to ${toDateOnly(toDate)}</div>
                        <div class="summary-item"><strong>Total Employees (Result):</strong> ${sortedEmployees.length}</div>
                        <div class="summary-item"><strong>Present:</strong> ${exportedStats.present}</div>
                        <div class="summary-item"><strong>On Leave:</strong> ${exportedStats['on-leave']}</div>
                        <div class="summary-item"><strong>Absent:</strong> ${exportedStats.absent}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Employee ID</th>
                <th>Employee Name</th>
                                <th>Status Date</th>
                                <th>Position</th>
                <th>Department</th>
                <th>Status</th>
                <th>Clock-In</th>
                <th>Clock-Out</th>
                <th>Duration</th>
                <th>Late</th>
              </tr>
            </thead>
            <tbody>
              ${sortedEmployees
                  .map(
                      emp => `
                <tr>
                  <td>${emp.employeeId}</td>
                  <td>${emp.lastName}, ${emp.firstName}</td>
                                    <td>${emp.statusDate || toDateOnly(toDate)}</td>
                                    <td>${emp.position || 'N/A'}</td>
                  <td>${emp.department}</td>
                                    <td class="status-${emp.status}">${formatStatusLabel(emp.status)}</td>
                  <td>${emp.clockInTime || 'N/A'}</td>
                  <td>${emp.clockOutTime || (emp.status === 'present' && !emp.clockOutTime ? 'Active' : 'N/A')}</td>
                  <td>${emp.workDuration || 'N/A'}</td>
                  <td>${emp.lateMinutes ? `<span class="late-badge">${emp.lateMinutes} min</span>` : 'No'}</td>
                </tr>
              `
                  )
                  .join('')}
            </tbody>
          </table>
          <div class="footer">
            Generated on ${format(new Date(), "MMMM dd, yyyy 'at' h:mm a")}<br>
            This is an automatically generated report from WFH PULSE.
          </div>
        </body>
      </html>
    `

        const blob = new Blob([htmlContent], { type: 'text/html' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.setAttribute('href', url)
        link.setAttribute(
            'download',
            `employee-status-${new Date().toISOString().split('T')[0]}.html`
        )
        link.style.visibility = 'hidden'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)

        toast.success('Report downloaded successfully')
    }

    const getStatusColor = (status: Employee['status']) => {
        switch (status) {
            case 'present':
                return 'bg-vibrant-green text-vibrant-green-foreground'
            case 'on-leave':
                return 'bg-vibrant-orange text-vibrant-orange-foreground'
            case 'absent':
                return 'bg-destructive text-destructive-foreground'
        }
    }

    // Leave request handlers
    useEffect(() => {
        if (typeof window === 'undefined') {
            return
        }

        window.localStorage.setItem(
            'wfh-pulse:dashboard:leave-filter-status',
            leaveFilterStatus
        )
    }, [leaveFilterStatus])

    useEffect(() => {
        const toSafeDate = (value: unknown, fallbackDate?: Date) => {
            if (typeof value !== 'string') {
                return fallbackDate ?? new Date()
            }

            const parsed = new Date(value)
            if (Number.isNaN(parsed.getTime())) {
                return fallbackDate ?? new Date()
            }

            return parsed
        }

        const isMissingLeaveRequestError = (message: string) =>
            /no existing request|request not found|leave request not found|not found/i.test(
                message
            )

        const loadLeaveRequests = async () => {
            if (!accessToken) {
                return
            }

            setIsLeaveRequestsLoading(true)

            try {
                const response = await fetch(
                    `${apiBaseUrl}/hr/leave-requests?sourcePage=dashboard`,
                    {
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                        },
                    }
                )

                const body = await response.json().catch(() => null)
                if (!response.ok) {
                    if (response.status === 404) {
                        setLeaveRequests([])
                        return
                    }

                    throw new Error(
                        body?.error ?? 'Failed to load leave requests'
                    )
                }

                const rows = Array.isArray(body?.requests)
                    ? (body.requests as LeaveRequestApiRow[])
                    : []

                const mapped = rows.map(row => {
                    const submittedDate = toSafeDate(row.submitted_at)
                    const startDate = toSafeDate(row.start_date, submittedDate)
                    const endDate = toSafeDate(row.end_date, startDate)

                    return {
                        id: String(row.request_id),
                        employeeId: String(row.employee_id ?? ''),
                        employeeName: String(row.employee_name ?? ''),
                        position: String(row.position ?? ''),
                        department: String(row.department ?? ''),
                        leaveType: String(row.leave_type_name ?? ''),
                        startDate,
                        endDate,
                        message: String(row.message ?? ''),
                        status: row.status,
                        submittedDate,
                        attachments: Array.isArray(row.attachments)
                            ? row.attachments
                                  .map(item => String(item?.fileName ?? ''))
                                  .filter(Boolean)
                            : [],
                        logTrail: Array.isArray(row.logs)
                            ? row.logs.map(log => ({
                                  status: log.status,
                                  date: toSafeDate(log.loggedAt, submittedDate),
                                  approvedBy: log.approvedBy ?? undefined,
                                  reason: log.reason ?? undefined,
                              }))
                            : [],
                    } as LeaveRequest
                })

                setLeaveRequests(mapped)
            } catch (error) {
                const message =
                    error instanceof Error
                        ? error.message
                        : 'Failed to load leave requests'
                if (isMissingLeaveRequestError(message)) {
                    setLeaveRequests([])
                    return
                }
                toast.error(message)
                setLeaveRequests([])
            } finally {
                setIsLeaveRequestsLoading(false)
            }
        }

        loadLeaveRequests()
    }, [accessToken, apiBaseUrl])

    const filteredLeaveRequests = leaveRequests
        .filter(req =>
            leaveFilterStatus === 'all'
                ? true
                : req.status === leaveFilterStatus
        )
        .sort((a, b) => b.submittedDate.getTime() - a.submittedDate.getTime())

    const handleViewLeaveDetails = (request: LeaveRequest) => {
        setSelectedLeaveRequest(request)
        setShowLeaveDetailsDialog(true)
    }

    const handleApproveLeave = () => {
        if (!selectedLeaveRequest) return

        setLeaveRequests(prev =>
            prev.map(req =>
                req.id === selectedLeaveRequest.id
                    ? {
                          ...req,
                          status: 'approved' as const,
                          logTrail: [
                              ...req.logTrail,
                              {
                                  status: 'approved' as const,
                                  date: new Date(),
                                  approvedBy: 'Sarah Martinez',
                              },
                          ],
                      }
                    : req
            )
        )

        toast.success('Leave request approved successfully')
        setShowApproveDialog(false)
        setShowLeaveDetailsDialog(false)
        setSelectedLeaveRequest(null)
    }

    const handleDenyLeave = () => {
        if (!selectedLeaveRequest) return

        if (!denyReason.trim()) {
            toast.error('Please provide a reason for denial')
            return
        }

        setLeaveRequests(prev =>
            prev.map(req =>
                req.id === selectedLeaveRequest.id
                    ? {
                          ...req,
                          status: 'denied' as const,
                          logTrail: [
                              ...req.logTrail,
                              {
                                  status: 'denied' as const,
                                  date: new Date(),
                                  approvedBy: 'Sarah Martinez',
                                  reason: denyReason,
                              },
                          ],
                      }
                    : req
            )
        )

        toast.success('Leave request denied')
        setShowDenyDialog(false)
        setShowLeaveDetailsDialog(false)
        setSelectedLeaveRequest(null)
        setDenyReason('')
    }

    const handleCancelApprovedLeave = () => {
        if (!selectedLeaveRequest) return

        if (!cancelReason.trim()) {
            toast.error('Please provide a reason for cancellation')
            return
        }

        setLeaveRequests(prev =>
            prev.map(req =>
                req.id === selectedLeaveRequest.id
                    ? {
                          ...req,
                          status: 'cancelled' as const,
                          logTrail: [
                              ...req.logTrail,
                              {
                                  status: 'cancelled' as const,
                                  date: new Date(),
                                  reason: cancelReason,
                                  ...(cancelAttachments.length > 0
                                      ? { attachments: cancelAttachments }
                                      : {}),
                              },
                          ],
                      }
                    : req
            )
        )

        toast.success('Leave request cancelled')
        setShowCancelApprovedDialog(false)
        setShowLeaveDetailsDialog(false)
        setSelectedLeaveRequest(null)
        setCancelReason('')
        setCancelAttachments([])
    }

    const getLeaveStatusBadge = (status: LeaveRequest['status']) => {
        switch (status) {
            case 'approved':
                return 'bg-vibrant-green/20 text-vibrant-green'
            case 'denied':
                return 'bg-red-500/20 text-red-600'
            case 'pending':
                return 'bg-vibrant-orange/20 text-vibrant-orange'
            case 'cancelled':
                return 'bg-muted-foreground/20 text-muted-foreground'
        }
    }

    const handleAddCancelAttachment = (fileName: string) => {
        setCancelAttachments(prev => [...prev, fileName])
    }

    const handleRemoveCancelAttachment = (index: number) => {
        setCancelAttachments(prev => prev.filter((_, i) => i !== index))
    }

    return (
        <div className="space-y-6 pb-20">
            <div className="px-4 space-y-4">
                {/* Current Employee Status - Collapsible Card */}
                <Card>
                    <CardHeader
                        className="pb-3 cursor-pointer hover:bg-accent/50 transition-colors"
                        onClick={() =>
                            setIsEmployeeStatusOpen(!isEmployeeStatusOpen)
                        }
                    >
                        <div className="flex items-center justify-between">
                            <CardTitle className="flex items-center gap-2">
                                <UserCheck className="h-5 w-5 text-vibrant-purple" />
                                Current Employee Status
                            </CardTitle>
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-muted-foreground">
                                    {sortedEmployees.length}{' '}
                                    {filterStatus !== 'all'
                                        ? 'Filtered'
                                        : 'Employees'}
                                </span>
                                <motion.div
                                    animate={{
                                        rotate: isEmployeeStatusOpen ? 180 : 0,
                                    }}
                                    transition={{
                                        duration: 0.3,
                                        ease: 'easeInOut',
                                    }}
                                >
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0"
                                        onClick={e => {
                                            e.stopPropagation()
                                            setIsEmployeeStatusOpen(
                                                !isEmployeeStatusOpen
                                            )
                                        }}
                                    >
                                        <ChevronDown className="h-4 w-4" />
                                    </Button>
                                </motion.div>
                            </div>
                        </div>
                    </CardHeader>
                    <AnimatePresence initial={false}>
                        {isEmployeeStatusOpen && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{
                                    height: 'auto',
                                    opacity: 1,
                                    transition: {
                                        height: {
                                            duration: 0.4,
                                            ease: [0.4, 0, 0.2, 1],
                                        },
                                        opacity: {
                                            duration: 0.3,
                                            delay: 0.1,
                                            ease: 'easeOut',
                                        },
                                    },
                                }}
                                exit={{
                                    height: 0,
                                    opacity: 0,
                                    transition: {
                                        height: {
                                            duration: 0.3,
                                            ease: [0.4, 0, 0.2, 1],
                                        },
                                        opacity: {
                                            duration: 0.2,
                                            ease: 'easeIn',
                                        },
                                    },
                                }}
                                style={{ overflow: 'hidden' }}
                            >
                                <CardContent className="space-y-4 pt-0">
                                    {/* Statistics Summary */}
                                    <div className={statusSummaryGridClassName}>
                                        {statusValues.map(status => {
                                            const styles =
                                                getStatusSummaryClasses(status)
                                            return (
                                                <div
                                                    key={status}
                                                    className={`text-center p-3 rounded-lg ${styles.container}`}
                                                >
                                                    <p
                                                        className={`text-2xl font-bold ${styles.text}`}
                                                    >
                                                        {stats[status]}
                                                    </p>
                                                    <p className="text-sm text-muted-foreground">
                                                        {formatStatusLabel(
                                                            status
                                                        )}
                                                    </p>
                                                </div>
                                            )
                                        })}
                                    </div>

                                    {/* Sort and Filter Controls */}
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        <div>
                                            <label className="text-sm text-muted-foreground mb-2 block">
                                                From Date
                                            </label>
                                            <Input
                                                type="datetime-local"
                                                value={fromDate}
                                                max={maxSelectableDateTime}
                                                step={60}
                                                onChange={event =>
                                                    handleFromDateChange(
                                                        event.target.value
                                                    )
                                                }
                                            />
                                        </div>
                                        <div>
                                            <label className="text-sm text-muted-foreground mb-2 block">
                                                To Date
                                            </label>
                                            <Input
                                                type="datetime-local"
                                                value={toDate}
                                                max={maxSelectableDateTime}
                                                step={60}
                                                onChange={event =>
                                                    handleToDateChange(
                                                        event.target.value
                                                    )
                                                }
                                            />
                                        </div>
                                        <div className="flex items-end">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="w-full"
                                                onClick={resetDateRangeToToday}
                                            >
                                                Set Today
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-sm text-muted-foreground mb-2 block flex items-center gap-1">
                                                <ArrowUpDown className="h-3 w-3" />
                                                Sort By
                                            </label>
                                            <Select
                                                value={sortBy}
                                                onValueChange={handleSortChange}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="name">
                                                        Name
                                                    </SelectItem>
                                                    <SelectItem value="department">
                                                        Department
                                                    </SelectItem>
                                                    <SelectItem value="status">
                                                        Status
                                                    </SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <label className="text-sm text-muted-foreground mb-2 block flex items-center gap-1">
                                                <Filter className="h-3 w-3" />
                                                Filter Status
                                            </label>
                                            <Select
                                                value={filterStatus}
                                                onValueChange={
                                                    handleFilterChange
                                                }
                                            >
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="all">
                                                        All
                                                    </SelectItem>
                                                    {statusValues.map(
                                                        status => (
                                                            <SelectItem
                                                                key={status}
                                                                value={status}
                                                            >
                                                                {formatStatusLabel(
                                                                    status
                                                                )}
                                                            </SelectItem>
                                                        )
                                                    )}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    {/* Export Buttons */}
                                    <div className="grid grid-cols-2 gap-2">
                                        <Button
                                            onClick={exportToCSV}
                                            variant="outline"
                                            className="w-full"
                                        >
                                            <FileText className="h-4 w-4 mr-2" />
                                            <span className="hidden xs:inline">
                                                Export CSV
                                            </span>
                                            <span className="xs:hidden">
                                                CSV
                                            </span>
                                        </Button>
                                        <Button
                                            onClick={exportToPDF}
                                            variant="outline"
                                            className="w-full"
                                        >
                                            <FileText className="h-4 w-4 mr-2" />
                                            <span className="hidden xs:inline">
                                                Export PDF
                                            </span>
                                            <span className="xs:hidden">
                                                PDF
                                            </span>
                                        </Button>
                                    </div>

                                    {/* Employee List */}
                                    <div className="space-y-3 pt-2 border-t">
                                        {currentEmployees.map(employee => (
                                            <div
                                                key={employee.id}
                                                className="flex items-start justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                        <p className="font-medium">
                                                            {employee.lastName},{' '}
                                                            {employee.firstName}
                                                        </p>
                                                        <Badge
                                                            className={`text-xs ${getStatusColor(employee.status)}`}
                                                        >
                                                            {formatStatusLabel(
                                                                employee.status
                                                            )}
                                                        </Badge>
                                                        {employee.lateMinutes && (
                                                            <Badge
                                                                variant="outline"
                                                                className="text-xs bg-vibrant-orange/10 text-vibrant-orange border-vibrant-orange/30"
                                                            >
                                                                Late{' '}
                                                                {
                                                                    employee.lateMinutes
                                                                }{' '}
                                                                min
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <div className="text-sm text-muted-foreground mb-1">
                                                        {employee.position ||
                                                            'Unassigned Position'}{' '}
                                                        •{' '}
                                                        {employee.department ||
                                                            'Unassigned Department'}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground mb-1">
                                                        Status Date:{' '}
                                                        {employee.statusDate ||
                                                            toDateOnly(toDate)}
                                                    </div>
                                                    {employee.clockInTime && (
                                                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                                            <span className="flex items-center gap-1">
                                                                <Clock className="h-3 w-3" />
                                                                In:{' '}
                                                                {
                                                                    employee.clockInTime
                                                                }
                                                            </span>
                                                            {employee.clockOutTime && (
                                                                <>
                                                                    <span className="flex items-center gap-1">
                                                                        Out:{' '}
                                                                        {
                                                                            employee.clockOutTime
                                                                        }
                                                                    </span>
                                                                    <span className="flex items-center gap-1 text-vibrant-blue">
                                                                        Duration:{' '}
                                                                        {
                                                                            employee.workDuration
                                                                        }
                                                                    </span>
                                                                </>
                                                            )}
                                                            {!employee.clockOutTime &&
                                                                employee.status ===
                                                                    'present' && (
                                                                    <span className="text-vibrant-green">
                                                                        Active
                                                                    </span>
                                                                )}
                                                        </div>
                                                    )}
                                                    {employee.status ===
                                                        'on-leave' &&
                                                        employee.workDuration && (
                                                            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                                                <span className="flex items-center gap-1 text-vibrant-orange">
                                                                    <Clock className="h-3 w-3" />
                                                                    Work
                                                                    Duration:{' '}
                                                                    {
                                                                        employee.workDuration
                                                                    }
                                                                </span>
                                                            </div>
                                                        )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Pagination Controls */}
                                    <div className="flex items-center justify-between pt-4 border-t border-border">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={handlePreviousPage}
                                            disabled={currentPage === 1}
                                        >
                                            <ChevronLeft className="h-4 w-4 mr-1" />
                                            Previous
                                        </Button>

                                        <span className="text-sm text-muted-foreground">
                                            Page {currentPage} of {totalPages}
                                        </span>

                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={handleNextPage}
                                            disabled={
                                                currentPage === totalPages
                                            }
                                        >
                                            Next
                                            <ChevronRight className="h-4 w-4 ml-1" />
                                        </Button>
                                    </div>
                                </CardContent>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </Card>

                {/* Leave Requests Management - Collapsible */}
                <Card>
                    <CardHeader
                        className="pb-3 cursor-pointer hover:bg-accent/50 transition-colors"
                        onClick={() =>
                            setIsLeaveRequestsOpen(!isLeaveRequestsOpen)
                        }
                    >
                        <div className="flex items-center justify-between">
                            <CardTitle className="flex items-center gap-2">
                                <CalendarIcon className="h-5 w-5 text-vibrant-pink" />
                                Leave Requests
                            </CardTitle>
                            <div className="flex items-center gap-2">
                                <span
                                    className={`text-sm font-medium ${
                                        leaveFilterStatus === 'pending'
                                            ? 'text-vibrant-orange'
                                            : leaveFilterStatus === 'approved'
                                              ? 'text-vibrant-green'
                                              : leaveFilterStatus === 'denied'
                                                ? 'text-red-600'
                                                : leaveFilterStatus ===
                                                    'cancelled'
                                                  ? 'text-muted-foreground'
                                                  : 'text-muted-foreground'
                                    }`}
                                >
                                    {filteredLeaveRequests.length} Request
                                    {filteredLeaveRequests.length !== 1
                                        ? 's'
                                        : ''}
                                </span>
                                <motion.div
                                    animate={{
                                        rotate: isLeaveRequestsOpen ? 180 : 0,
                                    }}
                                    transition={{
                                        duration: 0.3,
                                        ease: 'easeInOut',
                                    }}
                                >
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0"
                                        onClick={e => {
                                            e.stopPropagation()
                                            setIsLeaveRequestsOpen(
                                                !isLeaveRequestsOpen
                                            )
                                        }}
                                    >
                                        <ChevronDown className="h-4 w-4" />
                                    </Button>
                                </motion.div>
                            </div>
                        </div>
                    </CardHeader>
                    <AnimatePresence initial={false}>
                        {isLeaveRequestsOpen && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{
                                    height: 'auto',
                                    opacity: 1,
                                    transition: {
                                        height: {
                                            duration: 0.4,
                                            ease: [0.4, 0, 0.2, 1],
                                        },
                                        opacity: {
                                            duration: 0.3,
                                            delay: 0.1,
                                            ease: 'easeOut',
                                        },
                                    },
                                }}
                                exit={{
                                    height: 0,
                                    opacity: 0,
                                    transition: {
                                        height: {
                                            duration: 0.3,
                                            ease: [0.4, 0, 0.2, 1],
                                        },
                                        opacity: {
                                            duration: 0.2,
                                            ease: 'easeIn',
                                        },
                                    },
                                }}
                                style={{ overflow: 'hidden' }}
                            >
                                <CardContent className="space-y-3 pt-0">
                                    {/* Leave Filter */}
                                    <div>
                                        <label className="text-sm text-muted-foreground mb-2 block flex items-center gap-1">
                                            <Filter className="h-3 w-3" />
                                            Filter by Status
                                        </label>
                                        <Select
                                            value={leaveFilterStatus}
                                            onValueChange={value =>
                                                setLeaveFilterStatus(
                                                    value as typeof leaveFilterStatus
                                                )
                                            }
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">
                                                    All Requests
                                                </SelectItem>
                                                <SelectItem value="pending">
                                                    Pending
                                                </SelectItem>
                                                <SelectItem value="approved">
                                                    Approved
                                                </SelectItem>
                                                <SelectItem value="denied">
                                                    Denied
                                                </SelectItem>
                                                <SelectItem value="cancelled">
                                                    Cancelled
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* Leave Requests List */}
                                    <div className="space-y-2">
                                        {isLeaveRequestsLoading ? (
                                            <div className="text-center py-8 text-muted-foreground">
                                                <CalendarIcon className="h-12 w-12 mx-auto mb-2 opacity-20" />
                                                <p>Loading leave requests...</p>
                                            </div>
                                        ) : filteredLeaveRequests.length ===
                                          0 ? (
                                            <div className="text-center py-8 text-muted-foreground">
                                                <CalendarIcon className="h-12 w-12 mx-auto mb-2 opacity-20" />
                                                <p>
                                                    No{' '}
                                                    {leaveFilterStatus !== 'all'
                                                        ? leaveFilterStatus
                                                        : ''}{' '}
                                                    leave requests found
                                                </p>
                                            </div>
                                        ) : (
                                            filteredLeaveRequests.map(
                                                request => (
                                                    <div
                                                        key={request.id}
                                                        className="flex items-start justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
                                                        onClick={() =>
                                                            handleViewLeaveDetails(
                                                                request
                                                            )
                                                        }
                                                    >
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                                <p className="font-medium">
                                                                    {
                                                                        request.employeeName
                                                                    }
                                                                </p>
                                                                <Badge
                                                                    className={`text-xs ${getLeaveStatusBadge(request.status)}`}
                                                                >
                                                                    {
                                                                        request.status
                                                                    }
                                                                </Badge>
                                                            </div>
                                                            <p className="text-sm text-muted-foreground">
                                                                {
                                                                    request.leaveType
                                                                }
                                                            </p>
                                                            <p className="text-xs text-muted-foreground">
                                                                {
                                                                    request.position
                                                                }{' '}
                                                                |{' '}
                                                                {
                                                                    request.department
                                                                }
                                                            </p>
                                                            <p className="text-xs text-muted-foreground mt-1">
                                                                Submitted:{' '}
                                                                {format(
                                                                    request.submittedDate,
                                                                    'MMM dd, yyyy'
                                                                )}
                                                            </p>
                                                        </div>
                                                        <Eye className="h-4 w-4 text-muted-foreground mt-1 flex-shrink-0 ml-2" />
                                                    </div>
                                                )
                                            )
                                        )}
                                    </div>
                                </CardContent>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </Card>

                {/* Adjustment Requests Section - Collapsible */}
                <Card>
                    <CardHeader
                        className="pb-3 cursor-pointer hover:bg-accent/50 transition-colors"
                        onClick={() =>
                            setIsAdjustmentRequestsOpen(
                                !isAdjustmentRequestsOpen
                            )
                        }
                    >
                        <div className="flex items-center justify-between">
                            <CardTitle className="flex items-center gap-2">
                                <Clock className="h-5 w-5 text-vibrant-orange" />
                                Adjustment Requests
                            </CardTitle>
                            <div className="flex items-center gap-2">
                                <span
                                    className={`text-sm font-medium ${
                                        adjustmentFilterStatus === 'pending'
                                            ? 'text-vibrant-orange'
                                            : adjustmentFilterStatus ===
                                                'approved'
                                              ? 'text-vibrant-green'
                                              : adjustmentFilterStatus ===
                                                  'denied'
                                                ? 'text-red-600'
                                                : adjustmentFilterStatus ===
                                                    'cancelled'
                                                  ? 'text-muted-foreground'
                                                  : 'text-muted-foreground'
                                    }`}
                                >
                                    {adjustmentRequestsCount} Request
                                    {adjustmentRequestsCount !== 1 ? 's' : ''}
                                </span>
                                <motion.div
                                    animate={{
                                        rotate: isAdjustmentRequestsOpen
                                            ? 180
                                            : 0,
                                    }}
                                    transition={{
                                        duration: 0.3,
                                        ease: 'easeInOut',
                                    }}
                                >
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0"
                                        onClick={e => {
                                            e.stopPropagation()
                                            setIsAdjustmentRequestsOpen(
                                                !isAdjustmentRequestsOpen
                                            )
                                        }}
                                    >
                                        <ChevronDown className="h-4 w-4" />
                                    </Button>
                                </motion.div>
                            </div>
                        </div>
                    </CardHeader>
                    <AnimatePresence initial={false}>
                        {isAdjustmentRequestsOpen && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{
                                    height: 'auto',
                                    opacity: 1,
                                    transition: {
                                        height: {
                                            duration: 0.4,
                                            ease: [0.4, 0, 0.2, 1],
                                        },
                                        opacity: {
                                            duration: 0.3,
                                            delay: 0.1,
                                            ease: 'easeOut',
                                        },
                                    },
                                }}
                                exit={{
                                    height: 0,
                                    opacity: 0,
                                    transition: {
                                        height: {
                                            duration: 0.3,
                                            ease: [0.4, 0, 0.2, 1],
                                        },
                                        opacity: {
                                            duration: 0.2,
                                            ease: 'easeIn',
                                        },
                                    },
                                }}
                                style={{ overflow: 'hidden' }}
                            >
                                <CardContent className="space-y-3 pt-0">
                                    <AdjustmentRequestsSection
                                        apiBaseUrl={apiBaseUrl}
                                        accessToken={accessToken}
                                        onFilteredCountChange={
                                            setAdjustmentRequestsCount
                                        }
                                        filterStatus={adjustmentFilterStatus}
                                        onFilterStatusChange={
                                            setAdjustmentFilterStatus
                                        }
                                    />
                                </CardContent>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </Card>

                {/* Leave Request Details Dialog */}
                <Dialog
                    open={showLeaveDetailsDialog}
                    onOpenChange={setShowLeaveDetailsDialog}
                >
                    <DialogContent className="max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle className="flex items-center justify-between">
                                <span>Leave Request Details</span>
                                {selectedLeaveRequest && (
                                    <Badge
                                        className={`${getLeaveStatusBadge(selectedLeaveRequest.status)}`}
                                    >
                                        {selectedLeaveRequest.status}
                                    </Badge>
                                )}
                            </DialogTitle>
                            <DialogDescription>
                                {selectedLeaveRequest?.leaveType}
                            </DialogDescription>
                        </DialogHeader>

                        {selectedLeaveRequest && (
                            <div className="space-y-4">
                                {/* Employee Information */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <Label>Employee</Label>
                                        <div className="p-3 bg-muted rounded-md text-sm">
                                            <div className="font-medium">
                                                {
                                                    selectedLeaveRequest.employeeName
                                                }
                                            </div>
                                            <div className="text-xs text-muted-foreground mt-1">
                                                {selectedLeaveRequest.position}{' '}
                                                |{' '}
                                                {
                                                    selectedLeaveRequest.department
                                                }
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <Label>Request Date</Label>
                                        <div className="p-3 bg-muted rounded-md text-sm">
                                            {format(
                                                selectedLeaveRequest.submittedDate,
                                                'MMM dd, yyyy'
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Date Range */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <Label>From Date</Label>
                                        <div className="p-3 bg-muted rounded-md text-sm">
                                            {format(
                                                selectedLeaveRequest.startDate,
                                                'PPP'
                                            )}
                                        </div>
                                    </div>
                                    <div>
                                        <Label>To Date</Label>
                                        <div className="p-3 bg-muted rounded-md text-sm">
                                            {format(
                                                selectedLeaveRequest.endDate,
                                                'PPP'
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Days Count */}
                                <div className="bg-vibrant-blue/10 border border-vibrant-blue/30 rounded-lg p-3">
                                    <p className="text-sm text-vibrant-blue">
                                        Total days:{' '}
                                        {Math.ceil(
                                            (selectedLeaveRequest.endDate.getTime() -
                                                selectedLeaveRequest.startDate.getTime()) /
                                                (1000 * 60 * 60 * 24)
                                        ) + 1}{' '}
                                        day(s)
                                    </p>
                                </div>

                                {/* Message */}
                                <div>
                                    <Label>Reason</Label>
                                    <div className="p-3 bg-muted rounded-md text-sm">
                                        {selectedLeaveRequest.message}
                                    </div>
                                </div>

                                {/* Attachments */}
                                {selectedLeaveRequest.attachments.length >
                                    0 && (
                                    <div>
                                        <Label>Attachments</Label>
                                        <div className="space-y-2 mt-2">
                                            {selectedLeaveRequest.attachments.map(
                                                (file, index) => (
                                                    <div
                                                        key={index}
                                                        className="flex items-center justify-between gap-2 p-2 bg-muted rounded"
                                                    >
                                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                                            <FileText className="h-4 w-4 text-vibrant-blue flex-shrink-0" />
                                                            <span className="text-sm truncate">
                                                                {file}
                                                            </span>
                                                        </div>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => {
                                                                // Simulate download
                                                                toast.success(
                                                                    `Downloading ${file}...`
                                                                )
                                                            }}
                                                            className="h-8 w-8 p-0 flex-shrink-0"
                                                        >
                                                            <Download className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                )
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Log Trail */}
                                <div>
                                    <Label className="mb-3 block">
                                        Request Log Trail
                                    </Label>
                                    <div className="space-y-3">
                                        {selectedLeaveRequest.logTrail.map(
                                            (log, index) => (
                                                <div
                                                    key={index}
                                                    className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg"
                                                >
                                                    <div className="mt-1">
                                                        {log.status ===
                                                            'pending' && (
                                                            <Clock className="h-5 w-5 text-vibrant-orange" />
                                                        )}
                                                        {log.status ===
                                                            'approved' && (
                                                            <CheckCircle className="h-5 w-5 text-vibrant-green" />
                                                        )}
                                                        {log.status ===
                                                            'denied' && (
                                                            <XCircle className="h-5 w-5 text-red-600" />
                                                        )}
                                                        {log.status ===
                                                            'cancelled' && (
                                                            <AlertCircle className="h-5 w-5 text-muted-foreground" />
                                                        )}
                                                    </div>
                                                    <div className="flex-1">
                                                        <div className="flex items-center justify-between">
                                                            <p className="text-sm font-medium capitalize">
                                                                {log.status}
                                                            </p>
                                                            <p className="text-xs text-muted-foreground">
                                                                {format(
                                                                    log.date,
                                                                    "MMM dd, yyyy 'at' h:mm a"
                                                                )}
                                                            </p>
                                                        </div>
                                                        {log.approvedBy && (
                                                            <p className="text-xs text-muted-foreground mt-1">
                                                                By:{' '}
                                                                {log.approvedBy}
                                                            </p>
                                                        )}
                                                        {log.reason && (
                                                            <p className="text-xs text-muted-foreground mt-1 p-2 bg-muted rounded">
                                                                Reason:{' '}
                                                                {log.reason}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            )
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        <DialogFooter>
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setShowLeaveDetailsDialog(false)
                                    setSelectedLeaveRequest(null)
                                }}
                            >
                                Close
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Approve Confirmation Dialog */}
                <AlertDialog
                    open={showApproveDialog}
                    onOpenChange={setShowApproveDialog}
                >
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>
                                Approve Leave Request?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                                Are you sure you want to approve this leave
                                request?
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        {selectedLeaveRequest && (
                            <div className="px-6 pb-2">
                                <div className="p-3 bg-muted rounded-lg text-sm">
                                    <p className="font-medium text-foreground">
                                        {selectedLeaveRequest.employeeName} -{' '}
                                        {selectedLeaveRequest.leaveType}
                                    </p>
                                    <p className="text-xs mt-1 text-muted-foreground">
                                        {format(
                                            selectedLeaveRequest.startDate,
                                            'MMM dd'
                                        )}{' '}
                                        -{' '}
                                        {format(
                                            selectedLeaveRequest.endDate,
                                            'MMM dd, yyyy'
                                        )}
                                    </p>
                                </div>
                            </div>
                        )}
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={handleApproveLeave}
                                className="bg-vibrant-green text-vibrant-green-foreground hover:bg-vibrant-green/90"
                            >
                                Yes, Approve
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                {/* Deny Dialog */}
                <Dialog open={showDenyDialog} onOpenChange={setShowDenyDialog}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Deny Leave Request</DialogTitle>
                            <DialogDescription>
                                Please provide a reason for denying this leave
                                request. This will be visible to the employee.
                            </DialogDescription>
                        </DialogHeader>

                        {selectedLeaveRequest && (
                            <div className="space-y-4">
                                <div className="p-3 bg-muted rounded-lg">
                                    <p className="font-medium">
                                        {selectedLeaveRequest.employeeName} -{' '}
                                        {selectedLeaveRequest.leaveType}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        {format(
                                            selectedLeaveRequest.startDate,
                                            'MMM dd'
                                        )}{' '}
                                        -{' '}
                                        {format(
                                            selectedLeaveRequest.endDate,
                                            'MMM dd, yyyy'
                                        )}
                                    </p>
                                </div>

                                <div>
                                    <Label htmlFor="deny-reason">
                                        Reason for Denial *
                                    </Label>
                                    <Textarea
                                        id="deny-reason"
                                        placeholder="Please provide a detailed reason for denying this request..."
                                        rows={4}
                                        value={denyReason}
                                        onChange={e =>
                                            setDenyReason(e.target.value)
                                        }
                                        className="mt-2"
                                    />
                                </div>
                            </div>
                        )}

                        <DialogFooter>
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setShowDenyDialog(false)
                                    setDenyReason('')
                                }}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={handleDenyLeave}
                            >
                                Deny Request
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Cancel Approved Request Dialog */}
                <Dialog
                    open={showCancelApprovedDialog}
                    onOpenChange={setShowCancelApprovedDialog}
                >
                    <DialogContent className="max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>
                                Cancel Approved Leave Request
                            </DialogTitle>
                            <DialogDescription>
                                Please provide a reason for cancelling this
                                approved leave request.
                            </DialogDescription>
                        </DialogHeader>

                        {selectedLeaveRequest && (
                            <div className="space-y-4">
                                <div className="p-3 bg-muted rounded-lg">
                                    <p className="font-medium">
                                        {selectedLeaveRequest.employeeName} -{' '}
                                        {selectedLeaveRequest.leaveType}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        {format(
                                            selectedLeaveRequest.startDate,
                                            'MMM dd'
                                        )}{' '}
                                        -{' '}
                                        {format(
                                            selectedLeaveRequest.endDate,
                                            'MMM dd, yyyy'
                                        )}
                                    </p>
                                </div>

                                <div>
                                    <Label htmlFor="cancel-reason">
                                        Reason for Cancellation *
                                    </Label>
                                    <Textarea
                                        id="cancel-reason"
                                        placeholder="Please provide a detailed reason for cancelling this approved request..."
                                        rows={4}
                                        value={cancelReason}
                                        onChange={e =>
                                            setCancelReason(e.target.value)
                                        }
                                        className="mt-2"
                                    />
                                </div>

                                <div>
                                    <Label>Attachments (Optional)</Label>
                                    <div className="mt-2 space-y-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                const fileName = prompt(
                                                    'Enter attachment filename:'
                                                )
                                                if (fileName)
                                                    handleAddCancelAttachment(
                                                        fileName
                                                    )
                                            }}
                                            className="w-full"
                                        >
                                            <Paperclip className="h-4 w-4 mr-2" />
                                            Add Attachment
                                        </Button>
                                        {cancelAttachments.map(
                                            (file, index) => (
                                                <div
                                                    key={index}
                                                    className="flex items-center justify-between gap-2 p-2 bg-muted rounded"
                                                >
                                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                                        <FileText className="h-4 w-4 text-vibrant-blue flex-shrink-0" />
                                                        <span className="text-sm truncate">
                                                            {file}
                                                        </span>
                                                    </div>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() =>
                                                            handleRemoveCancelAttachment(
                                                                index
                                                            )
                                                        }
                                                        className="h-6 w-6 p-0"
                                                    >
                                                        <XCircle className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            )
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        <DialogFooter>
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setShowCancelApprovedDialog(false)
                                    setCancelReason('')
                                    setCancelAttachments([])
                                }}
                            >
                                Close
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={handleCancelApprovedLeave}
                            >
                                Cancel Leave Request
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    )
}
