import { useState, useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { AttendanceHeader } from './components/attendance-header'
import { BottomNavigation } from './components/bottom-navigation'
import { HomePage } from './components/pages/home-page'
import { DashboardPage } from './components/pages/dashboard-page'
import { CalendarPage } from './components/pages/calendar-page'
import { AnalyticsPage } from './components/pages/analytics-page'
import { SettingsPage } from './components/pages/settings-page'
import { EmployeeDetailsPage } from './components/pages/employee-details-page'
import { LoginForm } from './components/login-form'
import { toast } from 'sonner'
import { Toaster } from './components/ui/sonner'

interface AuthSession {
    accessToken: string
    refreshToken: string
    sessionId: string
}

interface UserProfileState {
    name: string
    email: string
    department: string
    departmentId: number | null
    phone: string
    birthday: string
    gender: string
    nationality: string
    maritalStatus: string
    address: string
    position: string
    positionId: number | null
    employmentType: string
    joinDate: string
    sssNumber: string
    tinNumber: string
    philhealthNumber: string
    pagibigNumber: string
    profilePicture: string | undefined
}

interface EmploymentDepartmentOption {
    departmentId: number
    name: string
}

interface EmploymentPositionOption {
    positionId: number
    departmentId: number
    name: string
}

interface EmploymentOptionsState {
    employmentTypes: string[]
    departments: EmploymentDepartmentOption[]
    positions: EmploymentPositionOption[]
}

interface SecurityPreferencesState {
    biometricLogin: boolean
    biometricClockInOut: boolean
    passwordWaived: boolean
    darkModeEnabled: boolean
}

interface PasswordActivityState {
    activityId: number
    action: string
    activityAt: string
    platform: string
    status: string
    isWaived: boolean
    details?: Record<string, unknown> | null
    ipAddress?: string | null
    userAgent?: string | null
}

type AttendanceStatusState =
    'present' | 'absent' | 'holiday' | 'late' | 'on-leave'

interface HolidayState {
    id: string
    name: string
    date: string
    type: 'public' | 'personal'
    countryCode?: string
    countryName?: string
    daysUntil: number
}

interface CelebrationState {
    id: string
    type: 'birthday'
    employeeId: string
    name: string
    date: string
    daysUntil: number
}

interface CalendarAttendanceDetailState {
    date: string
    status: AttendanceStatusState
    clockIn: string | null
    clockOut: string | null
    workDurationMinutes: number | null
    lateMinutes: number | null
    effectiveRecordType?: 'actual' | 'adjusted'
    adjustmentApprovalStatus?:
        'pending' | 'approved' | 'denied' | 'cancelled' | null
    overtimeApprovalStatus?:
        'pending' | 'approved' | 'denied' | 'cancelled' | null
}

interface AttendanceActivityLogState {
    activityId: number
    action: string
    loggedAt: string
}

interface LoginResponsePayload {
    accessToken: string
    refreshToken: string
    sessionId: string
    user?: {
        fullName?: string | null
        email?: string | null
        employeeId?: string | null
    }
}

interface SupabaseLoginResponsePayload {
    access_token: string
    refresh_token: string
    expires_in?: number
    expires_at?: number
    token_type?: string
    user?: {
        id?: string
        email?: string | null
        user_metadata?: {
            full_name?: string | null
        }
    }
}

const orderedWorkingDayKeys = [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
] as const

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/

type WorkingDayKey = (typeof orderedWorkingDayKeys)[number]
type WorkingDaysState = Record<WorkingDayKey, boolean>

function resolveApiBaseUrl() {
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
        return (
            (import.meta as any).env?.VITE_API_BASE_URL_ANDROID ??
            (import.meta as any).env?.VITE_API_BASE_URL ??
            ''
        )
    }

    return (import.meta as any).env?.VITE_API_BASE_URL ?? ''
}

export default function App() {
    const apiBaseUrl = resolveApiBaseUrl()
    const supabasePublishableKey =
        (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY ??
        (import.meta as any).env?.VITE_SUPABASE_ANON_KEY ??
        ''
    const isSupabaseBaseUrl = (() => {
        try {
            return new URL(apiBaseUrl).hostname.endsWith('.supabase.co')
        } catch {
            return false
        }
    })()
    const [isBiometricLoginAvailable, setIsBiometricLoginAvailable] = useState(
        () => {
            if (typeof window === 'undefined') {
                return false
            }

            const savedEnabled =
                window.localStorage.getItem('wfh:biometricLoginEnabled') ===
                'true'
            const hasRememberedBiometricUser = Boolean(
                window.localStorage.getItem('wfh:lastBiometricEmail')
            )

            return savedEnabled || hasRememberedBiometricUser
        }
    )
    const [isLoggedIn, setIsLoggedIn] = useState(false)
    const [authSession, setAuthSession] = useState<AuthSession | null>(null)
    const [currentPage, setCurrentPage] = useState('home')
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(
        null
    )
    const [isDarkMode, setIsDarkMode] = useState(false)
    const [isClockedIn, setIsClockedIn] = useState(false)
    const [isOnBreak, setIsOnBreak] = useState(false)
    const [clockInTime, setClockInTime] = useState<string>('')
    const [clockInTimestamp, setClockInTimestamp] = useState<Date | undefined>(
        undefined
    )
    const [todayWorkDurationMinutes, setTodayWorkDurationMinutes] = useState(0)
    const [todayLateMinutes, setTodayLateMinutes] = useState(0)
    const [attendanceActivityLogs, setAttendanceActivityLogs] = useState<
        AttendanceActivityLogState[]
    >([])

    // Settings state
    const [workingHours, setWorkingHours] = useState({
        start: '09:00',
        end: '18:00',
    })
    const [workingDays, setWorkingDays] = useState<WorkingDaysState>({
        monday: true,
        tuesday: true,
        wednesday: true,
        thursday: true,
        friday: true,
        saturday: false,
        sunday: false,
    })
    const [notifications, setNotifications] = useState({
        clockInReminder: true,
        clockOutReminder: true,
        dailyReport: false,
    })
    const [securityPreferences, setSecurityPreferences] =
        useState<SecurityPreferencesState>({
            biometricLogin: true,
            biometricClockInOut: false,
            passwordWaived: false,
            darkModeEnabled: false,
        })
    const [passwordActivities, setPasswordActivities] = useState<
        PasswordActivityState[]
    >([])
    const [userProfile, setUserProfile] = useState<UserProfileState>({
        name: 'Alex Ali',
        email: 'Alex.Ali@uic.co',
        department: 'Engineering',
        departmentId: null,
        phone: '',
        birthday: '',
        gender: '',
        nationality: '',
        maritalStatus: '',
        address: '',
        position: '',
        positionId: null,
        employmentType: 'full-time' as const,
        joinDate: '',
        sssNumber: '',
        tinNumber: '',
        philhealthNumber: '',
        pagibigNumber: '',
        profilePicture: undefined,
    })
    const [employmentOptions, setEmploymentOptions] =
        useState<EmploymentOptionsState>({
            employmentTypes: [
                'full-time',
                'independent contractor',
                'part-time',
                'intern',
                'contract-to-hire',
                'project-based',
                'temporary',
                'consultant',
                'freelance',
                'apprentice',
            ],
            departments: [],
            positions: [],
        })

    const mapApiProfileToState = (
        profile: Record<string, any> | null,
        fallback?: { fullName?: string | null; email?: string | null }
    ): UserProfileState => {
        if (!profile) {
            return {
                name: fallback?.fullName ?? '',
                email: fallback?.email ?? '',
                department: '',
                departmentId: null,
                phone: '',
                birthday: '',
                gender: '',
                nationality: '',
                maritalStatus: '',
                address: '',
                position: '',
                positionId: null,
                employmentType: 'full-time',
                joinDate: '',
                sssNumber: '',
                tinNumber: '',
                philhealthNumber: '',
                pagibigNumber: '',
                profilePicture: undefined,
            }
        }

        const firstName = profile.first_name ?? ''
        const lastName = profile.last_name ?? ''
        const fullName = `${firstName} ${lastName}`.trim()
        const parsedDepartmentId =
            profile.department_id == null ? null : Number(profile.department_id)
        const parsedPositionId =
            profile.position_id == null ? null : Number(profile.position_id)

        return {
            name: fullName || 'N/A',
            email: profile.email ?? '',
            department: profile.department ?? '',
            departmentId:
                parsedDepartmentId != null &&
                Number.isFinite(parsedDepartmentId)
                    ? parsedDepartmentId
                    : null,
            phone: profile.phone ?? '',
            birthday: profile.birthday
                ? String(profile.birthday).slice(0, 10)
                : '',
            gender: profile.gender ?? '',
            nationality: profile.nationality ?? '',
            maritalStatus: profile.marital_status ?? '',
            address: profile.address ?? '',
            position: profile.position ?? '',
            positionId:
                parsedPositionId != null && Number.isFinite(parsedPositionId)
                    ? parsedPositionId
                    : null,
            employmentType: profile.employment_type || 'full-time',
            joinDate: profile.join_date
                ? String(profile.join_date).slice(0, 10)
                : '',
            sssNumber: profile.sss ?? '',
            tinNumber: profile.tin ?? '',
            philhealthNumber: profile.phil_health ?? '',
            pagibigNumber: profile.pag_ibig ?? '',
            profilePicture: profile.profile_picture_url ?? undefined,
        }
    }

    const loadEmploymentOptions = async (accessToken: string) => {
        try {
            const response = await fetch(
                `${apiBaseUrl}/meta/employment-options`,
                {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                }
            )

            if (!response.ok) {
                return
            }

            const payload = await response.json()
            setEmploymentOptions({
                employmentTypes: Array.isArray(payload?.employmentTypes)
                    ? payload.employmentTypes
                    : [],
                departments: Array.isArray(payload?.departments)
                    ? payload.departments.map((department: any) => ({
                          departmentId: Number(department.department_id),
                          name: String(department.name),
                      }))
                    : [],
                positions: Array.isArray(payload?.positions)
                    ? payload.positions.map((position: any) => ({
                          positionId: Number(position.position_id),
                          departmentId: Number(position.department_id),
                          name: String(position.name),
                      }))
                    : [],
            })
        } catch {
            // Keep fallback options if endpoint is unavailable.
        }
    }

    const loadSelfProfile = async (
        accessToken: string,
        fallback?: { fullName?: string | null; email?: string | null }
    ) => {
        const response = await fetch(`${apiBaseUrl}/me/profile`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        })

        if (!response.ok) {
            if (response.status === 404 && fallback) {
                setUserProfile(mapApiProfileToState(null, fallback))
                return
            }

            const payload = await response.json().catch(() => ({}))
            throw new Error(payload?.error || 'Failed to load profile')
        }

        const payload = await response.json()
        setUserProfile(mapApiProfileToState(payload?.profile ?? null, fallback))
    }

    const updateSelfProfile = async (updates: Record<string, unknown>) => {
        if (!authSession?.accessToken) {
            toast.error('Unable to update profile', {
                description: 'Your session is missing. Please sign in again.',
            })
            return false
        }

        try {
            const response = await fetch(`${apiBaseUrl}/me/profile`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${authSession.accessToken}`,
                },
                body: JSON.stringify(updates),
            })

            const payload = await response.json().catch(() => ({}))
            if (!response.ok) {
                toast.error('Profile update failed', {
                    description:
                        payload?.error?.formErrors?.[0] ||
                        payload?.error ||
                        'Please review your input.',
                })
                return false
            }

            setUserProfile(mapApiProfileToState(payload?.profile ?? null))
            return true
        } catch {
            toast.error('Profile update failed', {
                description: 'Unable to reach the API server.',
            })
            return false
        }
    }

    const loadCompanyWorkingHours = async (accessToken: string) => {
        try {
            const response = await fetch(
                `${apiBaseUrl}/settings/company-working-hours`,
                {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                }
            )

            if (!response.ok) {
                return
            }

            const payload = await response.json().catch(() => ({}))
            const rows = Array.isArray(payload?.workingHours)
                ? payload.workingHours
                : []

            if (rows.length === 0) {
                return
            }

            const nextWorkingDays: WorkingDaysState = {
                monday: false,
                tuesday: false,
                wednesday: false,
                thursday: false,
                friday: false,
                saturday: false,
                sunday: false,
            }

            let start = '09:00'
            let end = '18:00'

            for (const row of rows) {
                const day = String(row.day || '').toLowerCase()
                if (!orderedWorkingDayKeys.includes(day as WorkingDayKey)) {
                    continue
                }

                const isWorkingDay = Boolean(row.is_working_day)
                nextWorkingDays[day as WorkingDayKey] = isWorkingDay

                if (isWorkingDay && row.start_time && row.end_time) {
                    start = String(row.start_time).slice(0, 5)
                    end = String(row.end_time).slice(0, 5)
                }
            }

            setWorkingDays(nextWorkingDays)
            setWorkingHours({ start, end })
        } catch {
            // Keep defaults when endpoint is unavailable or access is restricted.
        }
    }

    const updateCompanyWorkingHours = async (schedule: {
        start: string
        end: string
        days: WorkingDaysState
    }) => {
        if (!authSession?.accessToken) {
            toast.error('Unable to update work schedule', {
                description: 'Your session is missing. Please sign in again.',
            })
            return false
        }

        const rows = orderedWorkingDayKeys.map(day => ({
            day,
            isWorkingDay: Boolean(schedule.days[day]),
            startTime: schedule.days[day] ? schedule.start : null,
            endTime: schedule.days[day] ? schedule.end : null,
        }))

        try {
            const response = await fetch(
                `${apiBaseUrl}/settings/company-working-hours`,
                {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${authSession.accessToken}`,
                    },
                    body: JSON.stringify({ days: rows }),
                }
            )

            const payload = await response.json().catch(() => ({}))
            if (!response.ok) {
                toast.error('Work schedule update failed', {
                    description:
                        payload?.error || 'Please review your schedule values.',
                })
                return false
            }

            const savedRows = Array.isArray(payload?.workingHours)
                ? payload.workingHours
                : rows
            const nextWorkingDays: WorkingDaysState = {
                monday: false,
                tuesday: false,
                wednesday: false,
                thursday: false,
                friday: false,
                saturday: false,
                sunday: false,
            }

            let start = schedule.start
            let end = schedule.end
            for (const row of savedRows) {
                const day = String(row.day || '').toLowerCase()
                if (!orderedWorkingDayKeys.includes(day as WorkingDayKey)) {
                    continue
                }

                const isWorkingDay = Boolean(
                    row.is_working_day ?? row.isWorkingDay
                )
                nextWorkingDays[day as WorkingDayKey] = isWorkingDay

                if (isWorkingDay && row.start_time && row.end_time) {
                    start = String(row.start_time).slice(0, 5)
                    end = String(row.end_time).slice(0, 5)
                }
            }

            setWorkingDays(nextWorkingDays)
            setWorkingHours({ start, end })
            return true
        } catch {
            toast.error('Work schedule update failed', {
                description: 'Unable to reach the API server.',
            })
            return false
        }
    }

    const loadPasswordActivities = async (accessToken: string, limit = 20) => {
        try {
            const response = await fetch(
                `${apiBaseUrl}/me/security-preferences/password-activities?limit=${Math.max(1, Math.min(100, limit))}`,
                {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                }
            )

            if (!response.ok) {
                return
            }

            const payload = await response.json().catch(() => ({}))
            const rows = Array.isArray(payload?.passwordActivities)
                ? payload.passwordActivities
                : []

            setPasswordActivities(
                rows.map((row: any) => ({
                    activityId: Number(row.activityId),
                    action: String(row.action ?? 'Update Password'),
                    activityAt: String(row.activityAt ?? ''),
                    platform: String(row.platform ?? 'Unknown'),
                    status: String(row.status ?? 'Successful'),
                    isWaived: Boolean(row.isWaived),
                    details: row.details ?? null,
                    ipAddress: row.ipAddress ?? null,
                    userAgent: row.userAgent ?? null,
                }))
            )
        } catch {
            // Keep existing list when endpoint is unavailable.
        }
    }

    const loadSecurityPreferences = async (accessToken: string) => {
        try {
            const response = await fetch(
                `${apiBaseUrl}/me/security-preferences`,
                {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                }
            )

            if (!response.ok) {
                return
            }

            const payload = await response.json().catch(() => ({}))
            const pref = payload?.preferences ?? {}

            setSecurityPreferences({
                biometricLogin: Boolean(pref.biometricLogin),
                biometricClockInOut: Boolean(pref.biometricClockInOut),
                passwordWaived: Boolean(pref.passwordWaived),
                darkModeEnabled: Boolean(pref.darkModeEnabled),
            })
            setIsDarkMode(Boolean(pref.darkModeEnabled))
            setIsBiometricLoginAvailable(Boolean(pref.biometricLogin))
            window.localStorage.setItem(
                'wfh:biometricLoginEnabled',
                String(Boolean(pref.biometricLogin))
            )

            const rows = Array.isArray(payload?.passwordActivities)
                ? payload.passwordActivities
                : []
            setPasswordActivities(
                rows.map((row: any) => ({
                    activityId: Number(row.activityId),
                    action: String(row.action ?? 'Update Password'),
                    activityAt: String(row.activityAt ?? ''),
                    platform: String(row.platform ?? 'Unknown'),
                    status: String(row.status ?? 'Successful'),
                    isWaived: Boolean(row.isWaived),
                    details: row.details ?? null,
                    ipAddress: row.ipAddress ?? null,
                    userAgent: row.userAgent ?? null,
                }))
            )
        } catch {
            // Keep defaults when endpoint is unavailable.
        }
    }

    const updateSecurityPreferences = async (
        updates: Partial<SecurityPreferencesState>
    ) => {
        if (!authSession?.accessToken) {
            toast.error('Unable to update security preferences', {
                description: 'Your session is missing. Please sign in again.',
            })
            return false
        }

        try {
            const response = await fetch(
                `${apiBaseUrl}/me/security-preferences`,
                {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${authSession.accessToken}`,
                    },
                    body: JSON.stringify(updates),
                }
            )

            const payload = await response.json().catch(() => ({}))
            if (!response.ok) {
                toast.error('Security preferences update failed', {
                    description:
                        payload?.error ||
                        'Please review your security settings.',
                })
                return false
            }

            const pref = payload?.preferences ?? {}
            const nextBiometricLogin = Boolean(pref.biometricLogin)
            const nextDarkMode = Boolean(pref.darkModeEnabled)
            setSecurityPreferences({
                biometricLogin: nextBiometricLogin,
                biometricClockInOut: Boolean(pref.biometricClockInOut),
                passwordWaived: Boolean(pref.passwordWaived),
                darkModeEnabled: nextDarkMode,
            })
            setIsDarkMode(nextDarkMode)
            setIsBiometricLoginAvailable(nextBiometricLogin)
            window.localStorage.setItem(
                'wfh:biometricLoginEnabled',
                String(nextBiometricLogin)
            )
            return true
        } catch {
            toast.error('Security preferences update failed', {
                description: 'Unable to reach the API server.',
            })
            return false
        }
    }

    const updatePasswordForUser = async (payload: {
        newPassword: string
        waivePassword: boolean
        details?: Record<string, unknown>
    }) => {
        if (!authSession?.accessToken) {
            toast.error('Unable to update password', {
                description: 'Your session is missing. Please sign in again.',
            })
            return false
        }

        try {
            const platform = `${Capacitor.getPlatform().toUpperCase()} | Philippines`
            const response = await fetch(
                `${apiBaseUrl}/me/security-preferences/password`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${authSession.accessToken}`,
                    },
                    body: JSON.stringify({
                        newPassword: payload.newPassword,
                        waivePassword: payload.waivePassword,
                        platform,
                        status: 'Successful',
                        details: payload.details,
                    }),
                }
            )

            const body = await response.json().catch(() => ({}))
            if (!response.ok) {
                toast.error('Password update failed', {
                    description:
                        body?.error ||
                        'Please review the password requirements.',
                })
                return false
            }

            setSecurityPreferences(prev => ({
                ...prev,
                passwordWaived: payload.waivePassword,
            }))

            if (body?.activity) {
                const nextActivity: PasswordActivityState = {
                    activityId: Number(body.activity.activityId),
                    action: String(body.activity.action ?? 'Update Password'),
                    activityAt: String(body.activity.activityAt ?? ''),
                    platform: String(body.activity.platform ?? platform),
                    status: String(body.activity.status ?? 'Successful'),
                    isWaived: Boolean(body.activity.isWaived),
                    details: body.activity.details ?? null,
                    ipAddress: body.activity.ipAddress ?? null,
                    userAgent: body.activity.userAgent ?? null,
                }
                setPasswordActivities(prev =>
                    [nextActivity, ...prev].slice(0, 100)
                )
            }

            return true
        } catch {
            toast.error('Password update failed', {
                description: 'Unable to reach the API server.',
            })
            return false
        }
    }

    const loadCalendarData = async (accessToken: string) => {
        try {
            const response = await fetch(
                `${apiBaseUrl}/me/calendar?t=${Date.now()}`,
                {
                    method: 'GET',
                    cache: 'no-store',
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                }
            )

            if (!response.ok) {
                return
            }

            const payload = await response.json().catch(() => ({}))

            if (Array.isArray(payload?.attendance)) {
                const validStatuses = new Set<AttendanceStatusState>([
                    'present',
                    'absent',
                    'holiday',
                    'late',
                    'on-leave',
                ])

                const nextDetails: Record<
                    string,
                    CalendarAttendanceDetailState
                > = {}
                for (const row of payload.attendance as any[]) {
                    const date =
                        typeof row?.date === 'string'
                            ? row.date.slice(0, 10)
                            : ''
                    const status =
                        typeof row?.status === 'string' ? row.status : ''
                    if (
                        !date ||
                        !isoDateRegex.test(date) ||
                        !validStatuses.has(status as AttendanceStatusState)
                    ) {
                        continue
                    }

                    nextDetails[date] = {
                        date,
                        status: status as AttendanceStatusState,
                        clockIn:
                            typeof row?.clockIn === 'string'
                                ? row.clockIn.slice(0, 5)
                                : null,
                        clockOut:
                            typeof row?.clockOut === 'string'
                                ? row.clockOut.slice(0, 5)
                                : null,
                        workDurationMinutes:
                            typeof row?.workDurationMinutes === 'number'
                                ? row.workDurationMinutes
                                : null,
                        lateMinutes:
                            typeof row?.lateMinutes === 'number'
                                ? row.lateMinutes
                                : null,
                        effectiveRecordType:
                            row?.effectiveRecordType === 'adjusted'
                                ? 'adjusted'
                                : 'actual',
                        adjustmentApprovalStatus:
                            typeof row?.adjustmentApprovalStatus === 'string'
                                ? (row.adjustmentApprovalStatus as
                                      | 'pending'
                                      | 'approved'
                                      | 'denied'
                                      | 'cancelled')
                                : null,
                        overtimeApprovalStatus:
                            typeof row?.overtimeApprovalStatus === 'string'
                                ? (row.overtimeApprovalStatus as
                                      | 'pending'
                                      | 'approved'
                                      | 'denied'
                                      | 'cancelled')
                                : null,
                    }
                }

                setCalendarAttendanceDetails(nextDetails)
            }

            if (
                payload?.attendanceByDate &&
                typeof payload.attendanceByDate === 'object'
            ) {
                const validStatuses = new Set<AttendanceStatusState>([
                    'present',
                    'absent',
                    'holiday',
                    'late',
                    'on-leave',
                ])

                const nextAttendanceData: Record<
                    string,
                    AttendanceStatusState
                > = {}
                for (const [dateKey, status] of Object.entries(
                    payload.attendanceByDate as Record<string, unknown>
                )) {
                    if (
                        typeof dateKey !== 'string' ||
                        typeof status !== 'string'
                    ) {
                        continue
                    }
                    if (!validStatuses.has(status as AttendanceStatusState)) {
                        continue
                    }
                    nextAttendanceData[dateKey] =
                        status as AttendanceStatusState
                }

                setAttendanceData(nextAttendanceData)
            }

            if (Array.isArray(payload?.holidays)) {
                const nextHolidays: HolidayState[] = payload.holidays
                    .map((holiday: any) => {
                        const date =
                            typeof holiday?.date === 'string'
                                ? holiday.date.slice(0, 10)
                                : ''
                        if (!date || !isoDateRegex.test(date)) {
                            return null
                        }

                        const rawType = String(holiday?.type ?? 'public')
                        const type: HolidayState['type'] =
                            rawType === 'personal' ? 'personal' : 'public'

                        const holidayDate = new Date(`${date}T00:00:00`)
                        const today = new Date()
                        today.setHours(0, 0, 0, 0)
                        const computedDaysUntil = Math.ceil(
                            (holidayDate.getTime() - today.getTime()) /
                                (1000 * 60 * 60 * 24)
                        )

                        return {
                            id: String(
                                holiday?.id ??
                                    `${date}-${holiday?.name ?? 'holiday'}`
                            ),
                            name: String(holiday?.name ?? 'Holiday'),
                            date,
                            type,
                            countryCode: holiday?.countryCode
                                ? String(holiday.countryCode)
                                : undefined,
                            countryName: holiday?.countryName
                                ? String(holiday.countryName)
                                : undefined,
                            daysUntil:
                                typeof holiday?.daysUntil === 'number'
                                    ? holiday.daysUntil
                                    : computedDaysUntil,
                        }
                    })
                    .filter(Boolean) as HolidayState[]

                if (nextHolidays.length > 0) {
                    setHolidays(nextHolidays)
                }
            }

            if (Array.isArray(payload?.celebrations)) {
                const nextCelebrations: CelebrationState[] =
                    payload.celebrations
                        .map((celebration: any) => {
                            const date =
                                typeof celebration?.date === 'string'
                                    ? celebration.date.slice(0, 10)
                                    : ''
                            if (!date || !isoDateRegex.test(date)) {
                                return null
                            }

                            return {
                                id: String(
                                    celebration?.id ??
                                        `birthday-${celebration?.employeeId ?? 'emp'}-${date}`
                                ),
                                type: 'birthday' as const,
                                employeeId: String(
                                    celebration?.employeeId ?? ''
                                ),
                                name: String(celebration?.name ?? 'Employee'),
                                date,
                                daysUntil: Number(celebration?.daysUntil ?? 0),
                            }
                        })
                        .filter(Boolean) as CelebrationState[]

                setCelebrations(nextCelebrations)
            }
        } catch {
            // Keep static fallback calendar data when endpoint is unavailable.
        }
    }

    const formatTimeForDisplay = (time24: string) => {
        const match = String(time24 || '').match(/^(\d{2}):(\d{2})/)
        if (!match) {
            return time24
        }

        const hour24 = Number(match[1])
        const minute = Number(match[2])
        const hour12 = hour24 % 12 || 12
        const meridiem = hour24 >= 12 ? 'PM' : 'AM'
        return `${hour12}:${String(minute).padStart(2, '0')} ${meridiem}`
    }

    const buildClockInTimestampFromTime = (
        time24: string | null | undefined
    ) => {
        if (!time24) {
            return undefined
        }

        const match = String(time24).match(/^(\d{2}):(\d{2})/)
        if (!match) {
            return undefined
        }

        const now = new Date()
        const timestamp = new Date(now)
        timestamp.setHours(Number(match[1]), Number(match[2]), 0, 0)
        return timestamp
    }

    const syncAttendanceStateFromApi = (attendance: any) => {
        if (!attendance) {
            setIsClockedIn(false)
            setIsOnBreak(false)
            setClockInTime('')
            setClockInTimestamp(undefined)
            setTodayLateMinutes(0)
            return
        }

        const isClockedInNow =
            Boolean(attendance.clockIn) && !Boolean(attendance.clockOut)
        setIsClockedIn(isClockedInNow)
        setIsOnBreak(Boolean(attendance.isBreakActive))

        if (attendance.clockIn) {
            setClockInTime(formatTimeForDisplay(String(attendance.clockIn)))
            setClockInTimestamp(
                buildClockInTimestampFromTime(String(attendance.clockIn))
            )
        } else {
            setClockInTime('')
            setClockInTimestamp(undefined)
        }

        setTodayLateMinutes(Number(attendance.lateMinutes ?? 0))
    }

    const loadTodayAttendance = async (accessToken: string) => {
        try {
            const response = await fetch(`${apiBaseUrl}/me/attendance/today`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            })

            if (!response.ok) {
                return
            }

            const payload = await response.json().catch(() => ({}))
            syncAttendanceStateFromApi(payload?.attendance ?? null)
            setTodayWorkDurationMinutes(
                Number(payload?.currentWorkDurationMinutes ?? 0)
            )
            const logs = Array.isArray(payload?.logs)
                ? payload.logs
                      .map((row: any) => {
                          const activityId = Number(row?.activityId)
                          const action = String(row?.action ?? '')
                          const loggedAt = String(row?.loggedAt ?? '')
                          if (
                              !Number.isFinite(activityId) ||
                              !action ||
                              !loggedAt
                          ) {
                              return null
                          }
                          return {
                              activityId,
                              action,
                              loggedAt,
                          } as AttendanceActivityLogState
                      })
                      .filter(Boolean)
                : []
            setAttendanceActivityLogs(logs as AttendanceActivityLogState[])
        } catch {
            // Keep existing local state when the endpoint is unavailable.
        }
    }

    useEffect(() => {
        if (!isLoggedIn || !authSession?.accessToken) {
            return
        }

        const intervalId = window.setInterval(() => {
            void loadTodayAttendance(authSession.accessToken)
        }, 5000)

        return () => {
            window.clearInterval(intervalId)
        }
    }, [isLoggedIn, authSession?.accessToken])

    // Mock attendance data for the calendar - October 2025 (Weekdays only, no Saturdays/Sundays)
    const [calendarAttendanceDetails, setCalendarAttendanceDetails] = useState<
        Record<string, CalendarAttendanceDetailState>
    >({})

    // Mock attendance data for the calendar - October 2025 (Weekdays only, no Saturdays/Sundays)
    const [attendanceData, setAttendanceData] = useState<
        Record<string, AttendanceStatusState>
    >({
        // October 2025 data - All weekdays from Oct 1 to Oct 31
        '2025-10-01': 'present', // Wednesday
        '2025-10-02': 'present', // Thursday
        '2025-10-03': 'late', // Friday
        '2025-10-06': 'present', // Monday
        '2025-10-07': 'present', // Tuesday
        '2025-10-08': 'present', // Wednesday
        '2025-10-09': 'late', // Thursday
        '2025-10-10': 'present', // Friday
        '2025-10-13': 'present', // Monday
        '2025-10-14': 'present', // Tuesday
        '2025-10-15': 'absent', // Wednesday
        '2025-10-16': 'on-leave', // Thursday
        '2025-10-17': 'present', // Friday
        '2025-10-20': 'present', // Monday
        '2025-10-21': 'late', // Tuesday
        '2025-10-22': 'present', // Wednesday
        '2025-10-23': 'present', // Thursday
        '2025-10-24': 'present', // Friday
        '2025-10-27': 'present', // Monday
        '2025-10-28': 'present', // Tuesday
        '2025-10-29': 'late', // Wednesday
        '2025-10-30': 'present', // Thursday
        '2025-10-31': 'present', // Friday

        // September 2025 data - All weekdays from Sept 1 to Sept 30
        '2025-09-01': 'present', // Monday
        '2025-09-02': 'present', // Tuesday
        '2025-09-03': 'absent', // Wednesday
        '2025-09-04': 'present', // Thursday
        '2025-09-05': 'present', // Friday
        '2025-09-08': 'present', // Monday
        '2025-09-09': 'present', // Tuesday
        '2025-09-10': 'late', // Wednesday
        '2025-09-11': 'present', // Thursday
        '2025-09-12': 'present', // Friday
        '2025-09-15': 'absent', // Monday
        '2025-09-16': 'present', // Tuesday
        '2025-09-17': 'present', // Wednesday
        '2025-09-18': 'present', // Thursday
        '2025-09-19': 'late', // Friday
        '2025-09-22': 'present', // Monday
        '2025-09-23': 'present', // Tuesday
        '2025-09-24': 'absent', // Wednesday
        '2025-09-25': 'present', // Thursday
        '2025-09-26': 'late', // Friday
        '2025-09-29': 'present', // Monday
        '2025-09-30': 'present', // Tuesday

        // November 2025 data - Weekdays only (partial month for upcoming)
        '2025-11-03': 'present', // Monday
        '2025-11-04': 'present', // Tuesday
        '2025-11-05': 'present', // Wednesday
        '2025-11-06': 'late', // Thursday
        '2025-11-07': 'present', // Friday
        '2025-11-10': 'present', // Monday
        '2025-11-12': 'present', // Wednesday
        '2025-11-13': 'present', // Thursday
        '2025-11-14': 'present', // Friday
        '2025-11-17': 'present', // Monday
        '2025-11-18': 'present', // Tuesday
        '2025-11-19': 'late', // Wednesday
        '2025-11-20': 'present', // Thursday
        '2025-11-21': 'present', // Friday
        '2025-11-24': 'present', // Monday
        '2025-11-25': 'present', // Tuesday
        '2025-11-26': 'on-leave', // Wednesday

        // August 2025 data - Week 4-5 (partial month)
        '2025-08-18': 'present', // Monday
        '2025-08-19': 'present', // Tuesday
        '2025-08-20': 'late', // Wednesday
        '2025-08-21': 'present', // Thursday
        '2025-08-22': 'present', // Friday
        '2025-08-25': 'present', // Monday
        '2025-08-26': 'present', // Tuesday
        '2025-08-27': 'present', // Wednesday
        '2025-08-28': 'absent', // Thursday
        '2025-08-29': 'present', // Friday

        // June 2026 - June 1=Mon, June 12=Philippine Independence Day (holiday)
        '2026-06-01': 'present', // Monday
        '2026-06-02': 'present', // Tuesday
        '2026-06-03': 'present', // Wednesday
        '2026-06-04': 'present', // Thursday
        '2026-06-05': 'late', // Friday
        '2026-06-08': 'present', // Monday
        '2026-06-09': 'present', // Tuesday
        '2026-06-10': 'present', // Wednesday
        '2026-06-11': 'absent', // Thursday
        '2026-06-12': 'holiday', // Friday - Philippine Independence Day
        '2026-06-15': 'on-leave', // Monday
        '2026-06-16': 'present', // Tuesday
        '2026-06-17': 'present', // Wednesday
        '2026-06-18': 'present', // Thursday
        '2026-06-19': 'late', // Friday
        '2026-06-22': 'present', // Monday
        '2026-06-23': 'present', // Tuesday
        '2026-06-24': 'present', // Wednesday
        '2026-06-25': 'present', // Thursday
        '2026-06-26': 'present', // Friday
        '2026-06-29': 'present', // Monday
        '2026-06-30': 'present', // Tuesday

        // July 2026 (up to Jul 21) - July 1=Wed, July 4=Sat (Independence Day USA)
        '2026-07-01': 'present', // Wednesday
        '2026-07-02': 'present', // Thursday
        '2026-07-03': 'present', // Friday
        // July 4 = Saturday (Independence Day USA - weekend)
        '2026-07-06': 'present', // Monday
        '2026-07-07': 'late', // Tuesday
        '2026-07-08': 'present', // Wednesday
        '2026-07-09': 'present', // Thursday
        '2026-07-10': 'present', // Friday
        '2026-07-13': 'present', // Monday
        '2026-07-14': 'on-leave', // Tuesday
        '2026-07-15': 'absent', // Wednesday
        '2026-07-16': 'present', // Thursday
        '2026-07-17': 'present', // Friday
        '2026-07-20': 'late', // Monday
        '2026-07-21': 'present', // Tuesday (today)
    })

    // Mock holidays data - USA & Philippines (Current date: Jul 21, 2026)
    // Only upcoming holidays shown (past holidays filtered out)
    const [holidays, setHolidays] = useState<HolidayState[]>([
        {
            id: 'h1',
            name: 'Ninoy Aquino Day (Philippines)',
            date: '2026-08-21',
            type: 'public' as const,
            daysUntil: 31,
        },
        {
            id: 'h2',
            name: 'National Heroes Day (Philippines)',
            date: '2026-08-31',
            type: 'public' as const,
            daysUntil: 41,
        },
        {
            id: 'h3',
            name: 'Labor Day (USA)',
            date: '2026-09-07',
            type: 'public' as const,
            daysUntil: 48,
        },
        {
            id: 'h4',
            name: 'Columbus Day (USA)',
            date: '2026-10-12',
            type: 'public' as const,
            daysUntil: 83,
        },
        {
            id: 'h5',
            name: "All Saints' Day (Philippines)",
            date: '2026-11-01',
            type: 'public' as const,
            daysUntil: 103,
        },
        {
            id: 'h6',
            name: 'Veterans Day (USA)',
            date: '2026-11-11',
            type: 'public' as const,
            daysUntil: 113,
        },
        {
            id: 'h7',
            name: 'Thanksgiving Day (USA)',
            date: '2026-11-26',
            type: 'public' as const,
            daysUntil: 128,
        },
        {
            id: 'h8',
            name: 'Bonifacio Day (Philippines)',
            date: '2026-11-30',
            type: 'public' as const,
            daysUntil: 132,
        },
        {
            id: 'h9',
            name: 'Feast of the Immaculate Conception (Philippines)',
            date: '2026-12-08',
            type: 'public' as const,
            daysUntil: 140,
        },
        {
            id: 'h10',
            name: 'Christmas Eve',
            date: '2026-12-24',
            type: 'public' as const,
            daysUntil: 156,
        },
        {
            id: 'h11',
            name: 'Christmas Day',
            date: '2026-12-25',
            type: 'public' as const,
            daysUntil: 157,
        },
        {
            id: 'h12',
            name: 'Rizal Day (Philippines)',
            date: '2026-12-30',
            type: 'public' as const,
            daysUntil: 162,
        },
        {
            id: 'h13',
            name: "New Year's Eve",
            date: '2026-12-31',
            type: 'public' as const,
            daysUntil: 163,
        },
        {
            id: 'h14',
            name: "New Year's Day",
            date: '2027-01-01',
            type: 'public' as const,
            daysUntil: 164,
        },
    ])
    const [celebrations, setCelebrations] = useState<CelebrationState[]>([])

    // Apply theme to document
    useEffect(() => {
        document.documentElement.classList.toggle('dark', isDarkMode)
    }, [isDarkMode])

    const handleToggleTheme = async () => {
        if (!isLoggedIn) {
            return
        }

        const nextDarkMode = !isDarkMode
        setIsDarkMode(nextDarkMode)

        const didUpdate = await updateSecurityPreferences({
            darkModeEnabled: nextDarkMode,
        })

        if (!didUpdate) {
            setIsDarkMode(!nextDarkMode)
            return
        }

        toast.success(`Switched to ${nextDarkMode ? 'dark' : 'light'} mode`)
    }

    useEffect(() => {
        const loadBiometricAvailability = async () => {
            if (isSupabaseBaseUrl) {
                setIsBiometricLoginAvailable(false)
                return
            }

            try {
                const response = await fetch(
                    `${apiBaseUrl}/auth/biometric-login/available`,
                    {
                        method: 'GET',
                    }
                )

                if (!response.ok) {
                    return
                }

                const payload = await response.json().catch(() => ({}))
                const available = Boolean(payload?.available)
                setIsBiometricLoginAvailable(prev => prev || available)
            } catch {
                // Keep the persisted local preference when availability endpoint is unreachable.
            }
        }

        void loadBiometricAvailability()
    }, [apiBaseUrl, isSupabaseBaseUrl])

    const completeSignIn = async (
        payload: Partial<LoginResponsePayload>,
        options: { skipBootstrap?: boolean } = {}
    ) => {
        if (
            !payload?.accessToken ||
            !payload?.refreshToken ||
            !payload?.sessionId
        ) {
            toast.error('Sign in failed', {
                description:
                    'API login response is missing session information.',
            })
            return false
        }

        setAuthSession({
            accessToken: payload.accessToken,
            refreshToken: payload.refreshToken,
            sessionId: payload.sessionId,
        })

        if (payload.user?.email) {
            window.localStorage.setItem(
                'wfh:lastBiometricEmail',
                payload.user.email
            )
        }

        setUserProfile(prev => ({
            ...prev,
            name: payload.user?.fullName || prev.name,
            email: payload.user?.email || prev.email,
        }))

        if (!options.skipBootstrap) {
            await loadSelfProfile(payload.accessToken, {
                fullName: payload.user?.fullName,
                email: payload.user?.email,
            })
            await loadEmploymentOptions(payload.accessToken)
            await loadCompanyWorkingHours(payload.accessToken)
            await loadSecurityPreferences(payload.accessToken)
            await loadCalendarData(payload.accessToken)
            await loadTodayAttendance(payload.accessToken)
        }

        setIsLoggedIn(true)
        return true
    }

    const handleLogin = async (email: string, password: string) => {
        try {
            const loginUrl = isSupabaseBaseUrl
                ? `${apiBaseUrl}/auth/v1/token?grant_type=password`
                : `${apiBaseUrl}/auth/login`
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            }

            if (isSupabaseBaseUrl && supabasePublishableKey) {
                headers.apikey = supabasePublishableKey
                headers.Authorization = `Bearer ${supabasePublishableKey}`
            }

            const response = await fetch(loginUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify({ email, password }),
            })

            let payload:
                | ({ error?: string } & Partial<LoginResponsePayload>)
                | ({
                      error_description?: string
                  } & Partial<SupabaseLoginResponsePayload>)
                | null = null
            try {
                payload = await response.json()
            } catch {
                payload = null
            }

            if (!response.ok) {
                toast.error('Sign in failed', {
                    description:
                        (payload as any)?.error ||
                        (payload as any)?.error_description ||
                        'User does not exist or password is incorrect',
                })
                return
            }

            if (!payload) {
                return
            }

            if (isSupabaseBaseUrl) {
                const supabasePayload =
                    payload as Partial<SupabaseLoginResponsePayload>
                const mappedPayload: Partial<LoginResponsePayload> = {
                    accessToken: supabasePayload.access_token ?? '',
                    refreshToken: supabasePayload.refresh_token ?? '',
                    sessionId:
                        supabasePayload.user?.id ??
                        `${Date.now()}-${Math.random()}`,
                    user: {
                        email: supabasePayload.user?.email ?? email,
                        fullName:
                            supabasePayload.user?.user_metadata?.full_name ??
                            null,
                    },
                }

                const didSignIn = await completeSignIn(mappedPayload, {
                    skipBootstrap: true,
                })
                if (!didSignIn) {
                    return
                }

                toast.success('Welcome back!', {
                    description: 'Signed in with Supabase Auth.',
                })
                return
            }

            const didSignIn = await completeSignIn(payload)
            if (!didSignIn) {
                return
            }

            toast.success('Welcome back!', {
                description: 'Successfully signed in to your account',
            })
        } catch {
            toast.error('Sign in failed', {
                description:
                    'Unable to reach auth server. Please check your API connection.',
            })
        }
    }

    const handleBiometricLogin = async () => {
        if (isSupabaseBaseUrl) {
            toast.error('Face ID sign in unavailable', {
                description:
                    'Biometric sign-in requires your custom API auth route. Use email and password for Supabase Auth mode.',
            })
            return
        }

        try {
            const rememberedEmail =
                window.localStorage.getItem('wfh:lastBiometricEmail') ||
                undefined
            const response = await fetch(`${apiBaseUrl}/auth/biometric-login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(
                    rememberedEmail ? { email: rememberedEmail } : {}
                ),
            })

            let payload:
                ({ error?: string } & Partial<LoginResponsePayload>) | null =
                null
            try {
                payload = await response.json()
            } catch {
                payload = null
            }

            if (!response.ok) {
                toast.error('Face ID sign in failed', {
                    description:
                        payload?.error ||
                        'Biometric sign-in is not available for this user.',
                })
                return
            }

            const didSignIn = await completeSignIn(payload ?? {})
            if (!didSignIn) {
                return
            }

            toast.success('Face ID sign in successful', {
                description: 'Temporary biometric session started.',
            })
        } catch {
            toast.error('Face ID sign in failed', {
                description:
                    'Unable to reach auth server. Please check your API connection.',
            })
        }
    }

    const handleLogout = () => {
        setAuthSession(null)
        setIsLoggedIn(false)
        setIsDarkMode(false)
        setIsClockedIn(false)
        setIsOnBreak(false)
        setClockInTime('')
        setClockInTimestamp(undefined)
        setTodayWorkDurationMinutes(0)
        setTodayLateMinutes(0)
        setAttendanceActivityLogs([])
        setCurrentPage('home')
        toast.success('Logged out successfully', {
            description: 'See you next time!',
        })
    }

    const handleClockIn = async () => {
        if (!authSession?.accessToken) {
            toast.error('Clock in failed', {
                description: 'Please sign in first.',
            })
            return
        }

        try {
            const response = await fetch(
                `${apiBaseUrl}/me/attendance/clock-in`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${authSession.accessToken}`,
                        'Content-Type': 'application/json',
                    },
                }
            )

            const payload = await response.json().catch(() => ({}))
            if (!response.ok) {
                toast.error('Clock in failed', {
                    description:
                        payload?.error || 'Unable to clock in right now.',
                })
                return
            }

            syncAttendanceStateFromApi(payload?.attendance ?? null)
            await loadTodayAttendance(authSession.accessToken)
            await loadCalendarData(authSession.accessToken)

            const displayTime = payload?.attendance?.clockIn
                ? formatTimeForDisplay(String(payload.attendance.clockIn))
                : ''
            toast.success(
                displayTime
                    ? `Successfully clocked in at ${displayTime}`
                    : 'Successfully clocked in',
                {
                    description: 'Have a productive day!',
                }
            )
        } catch {
            toast.error('Clock in failed', {
                description: 'Unable to reach the API server.',
            })
        }
    }

    const handleClockOut = async () => {
        if (!authSession?.accessToken) {
            toast.error('Clock out failed', {
                description: 'Please sign in first.',
            })
            return
        }

        try {
            const response = await fetch(
                `${apiBaseUrl}/me/attendance/clock-out`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${authSession.accessToken}`,
                        'Content-Type': 'application/json',
                    },
                }
            )

            const payload = await response.json().catch(() => ({}))
            if (!response.ok) {
                toast.error('Clock out failed', {
                    description:
                        payload?.error || 'Unable to clock out right now.',
                })
                return
            }

            syncAttendanceStateFromApi(payload?.attendance ?? null)
            await loadTodayAttendance(authSession.accessToken)
            await loadCalendarData(authSession.accessToken)

            const displayTime = payload?.attendance?.clockOut
                ? formatTimeForDisplay(String(payload.attendance.clockOut))
                : ''
            toast.success(
                displayTime
                    ? `Successfully clocked out at ${displayTime}`
                    : 'Successfully clocked out',
                {
                    description: 'Great work today!',
                }
            )
        } catch {
            toast.error('Clock out failed', {
                description: 'Unable to reach the API server.',
            })
        }
    }

    const handleBreak = async () => {
        if (!authSession?.accessToken) {
            toast.error('Break action failed', {
                description: 'Please sign in first.',
            })
            return
        }

        try {
            const endpoint = isOnBreak
                ? `${apiBaseUrl}/me/attendance/break/end`
                : `${apiBaseUrl}/me/attendance/break/start`

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${authSession.accessToken}`,
                    'Content-Type': 'application/json',
                },
            })

            const payload = await response.json().catch(() => ({}))
            if (!response.ok) {
                toast.error('Break action failed', {
                    description:
                        payload?.error ||
                        'Unable to update break status right now.',
                })
                return
            }

            syncAttendanceStateFromApi(payload?.attendance ?? null)
            await loadTodayAttendance(authSession.accessToken)
            await loadCalendarData(authSession.accessToken)

            if (isOnBreak) {
                const breakMinutes = Number(
                    payload?.breakLog?.breakDurationMinutes ?? 0
                )
                toast.success('Break ended', {
                    description:
                        breakMinutes > 0
                            ? `Break duration logged: ${breakMinutes} minute${breakMinutes === 1 ? '' : 's'}.`
                            : 'Welcome back! Ready to continue?',
                })
            } else {
                toast.success('Break started', {
                    description: 'Take your time and recharge!',
                })
            }
        } catch {
            toast.error('Break action failed', {
                description: 'Unable to reach the API server.',
            })
        }
    }

    const handleAddHoliday = (
        holiday: Omit<HolidayState, 'id' | 'daysUntil'>
    ) => {
        const today = new Date()
        const holidayDate = new Date(holiday.date)
        const daysUntil = Math.ceil(
            (holidayDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        )

        const newHoliday = {
            ...holiday,
            id: Date.now().toString(),
            daysUntil,
        }

        setHolidays(prev => [...prev, newHoliday])
    }

    const handleEditHoliday = (
        id: string,
        holiday: Omit<HolidayState, 'id' | 'daysUntil'>
    ) => {
        const today = new Date()
        const holidayDate = new Date(holiday.date)
        const daysUntil = Math.ceil(
            (holidayDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        )

        setHolidays(prev =>
            prev.map(h => (h.id === id ? { ...holiday, id, daysUntil } : h))
        )
    }

    const handleDeleteHoliday = (id: string) => {
        setHolidays(prev => prev.filter(h => h.id !== id))
    }

    const formatWorkingHours = () => {
        const startTime = new Date(`1970-01-01T${workingHours.start}:00`)
        const endTime = new Date(`1970-01-01T${workingHours.end}:00`)

        const formatTime = (date: Date) =>
            date.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
            })

        return `${formatTime(startTime)} - ${formatTime(endTime)}`
    }

    const handleEmployeeClick = (employeeId: string) => {
        setSelectedEmployeeId(employeeId)
        setCurrentPage('employee-details')
    }

    const handleBackFromEmployeeDetails = () => {
        setSelectedEmployeeId(null)
        setCurrentPage('home')
    }

    const renderCurrentPage = () => {
        switch (currentPage) {
            case 'home':
                return (
                    <HomePage
                        isClockedIn={isClockedIn}
                        isOnBreak={isOnBreak}
                        clockInTime={clockInTime}
                        clockInTimestamp={clockInTimestamp}
                        currentWorkDurationMinutes={todayWorkDurationMinutes}
                        lateMinutesToday={todayLateMinutes}
                        attendanceActivityLogs={attendanceActivityLogs}
                        onClockIn={handleClockIn}
                        onClockOut={handleClockOut}
                        onBreak={handleBreak}
                        attendanceData={attendanceData}
                        calendarAttendanceDetails={calendarAttendanceDetails}
                        holidays={holidays}
                        celebrations={celebrations}
                        workingHours={formatWorkingHours()}
                        scheduledStartTime={workingHours.start}
                        location="Tech Hub Office, Floor 5"
                        apiBaseUrl={apiBaseUrl}
                        accessToken={authSession?.accessToken ?? ''}
                        employmentOptions={employmentOptions}
                        onEmployeeClick={handleEmployeeClick}
                        onCalendarRefresh={async () => {
                            if (!authSession?.accessToken) {
                                return
                            }
                            await loadCalendarData(authSession.accessToken)
                        }}
                    />
                )
            case 'dashboard':
                return (
                    <DashboardPage
                        apiBaseUrl={apiBaseUrl}
                        accessToken={authSession?.accessToken ?? ''}
                        employmentOptions={employmentOptions}
                    />
                )
            case 'calendar':
                return (
                    <CalendarPage
                        attendanceData={Object.fromEntries(
                            Object.entries(attendanceData).filter(
                                ([, status]) => status !== 'on-leave'
                            ) as Array<
                                [
                                    string,
                                    'absent' | 'holiday' | 'late' | 'present',
                                ]
                            >
                        )}
                        holidays={holidays}
                        onAddHoliday={handleAddHoliday}
                        onEditHoliday={handleEditHoliday}
                        onDeleteHoliday={handleDeleteHoliday}
                    />
                )
            case 'analytics':
                return (
                    <AnalyticsPage
                        attendanceData={Object.fromEntries(
                            Object.entries(attendanceData).filter(
                                ([, status]) => status !== 'on-leave'
                            ) as Array<
                                [
                                    string,
                                    'absent' | 'holiday' | 'late' | 'present',
                                ]
                            >
                        )}
                        employmentOptions={employmentOptions}
                    />
                )
            case 'settings':
                return (
                    <SettingsPage
                        workingHours={workingHours}
                        workingDays={workingDays}
                        onUpdateWorkingHours={updateCompanyWorkingHours}
                        notifications={notifications}
                        onUpdateNotifications={setNotifications}
                        securityPreferences={securityPreferences}
                        onUpdateSecurityPreferences={updateSecurityPreferences}
                        passwordActivities={passwordActivities}
                        onUpdatePassword={updatePasswordForUser}
                        onLoadPasswordActivities={async limit => {
                            if (!authSession?.accessToken) {
                                return
                            }
                            await loadPasswordActivities(
                                authSession.accessToken,
                                limit
                            )
                        }}
                        userProfile={userProfile}
                        employmentOptions={employmentOptions}
                        onUpdateProfile={updateSelfProfile}
                    />
                )
            case 'employee-details':
                return selectedEmployeeId ? (
                    <EmployeeDetailsPage
                        employeeId={selectedEmployeeId}
                        apiBaseUrl={apiBaseUrl}
                        accessToken={authSession?.accessToken ?? ''}
                        employmentOptions={employmentOptions}
                        onBack={handleBackFromEmployeeDetails}
                    />
                ) : null
            default:
                return null
        }
    }

    // Show login form if not logged in
    if (!isLoggedIn) {
        return (
            <>
                <LoginForm
                    onLogin={handleLogin}
                    onBiometricLogin={handleBiometricLogin}
                    showBiometricLogin={isBiometricLoginAvailable}
                />
                <Toaster richColors position="top-center" closeButton />
            </>
        )
    }

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="max-w-md mx-auto bg-background shadow-2xl min-h-screen relative">
                <AttendanceHeader
                    isDarkMode={isDarkMode}
                    onToggleTheme={handleToggleTheme}
                    onLogout={handleLogout}
                />

                <div className="px-0 pt-24 pb-20">{renderCurrentPage()}</div>

                <BottomNavigation
                    currentPage={currentPage}
                    onPageChange={setCurrentPage}
                />
            </div>

            <Toaster richColors position="top-center" closeButton />
        </div>
    )
}
