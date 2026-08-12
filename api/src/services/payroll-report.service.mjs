const WORKING_DAYS_PER_MONTH = 21
const WORKING_HOURS_PER_DAY = 8
const MINUTES_PER_HOUR = 60

function toNonNegativeNumber(value) {
    const number = Number(value ?? 0)
    return Number.isFinite(number) ? Math.max(0, number) : 0
}

function roundMoney(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100
}

export function calculatePayrollReport({
    salary,
    deductions = [],
    otherEarnings = [],
    records = [],
}) {
    const monthlySalary = toNonNegativeNumber(salary)
    const dailyRate = monthlySalary / WORKING_DAYS_PER_MONTH
    const hourlyRate = dailyRate / WORKING_HOURS_PER_DAY
    const minuteRate = hourlyRate / MINUTES_PER_HOUR

    const attendance = records.reduce(
        (summary, record) => {
            const status = String(record.status ?? 'absent')
            const workMinutes = toNonNegativeNumber(record.workDurationMinutes)
            const lateMinutes = toNonNegativeNumber(record.lateMinutes)

            summary.totalWorkMinutes += workMinutes
            summary.totalLateMinutes += lateMinutes

            if (status === 'on-leave') {
                summary.leaveDays += 1
            } else if (status === 'holiday') {
                summary.holidayDays += 1
            } else if (status === 'absent') {
                summary.absentDays += 1
            } else {
                summary.presentDays += 1
                if (status === 'late' || lateMinutes > 0) {
                    summary.lateDays += 1
                }
            }

            return summary
        },
        {
            presentDays: 0,
            absentDays: 0,
            leaveDays: 0,
            holidayDays: 0,
            lateDays: 0,
            totalWorkMinutes: 0,
            totalLateMinutes: 0,
        }
    )

    const payrollDeductions = deductions.map(deduction => ({
        id: String(deduction.id ?? ''),
        name: String(deduction.name ?? ''),
        amount: roundMoney(toNonNegativeNumber(deduction.amount)),
    }))
    const configuredDeductions = payrollDeductions.reduce(
        (total, deduction) => total + deduction.amount,
        0
    )
    const payrollOtherEarnings = otherEarnings.map(earning => ({
        id: String(earning.id ?? ''),
        name: String(earning.name ?? ''),
        amount: roundMoney(toNonNegativeNumber(earning.amount)),
    }))
    const totalOtherEarnings = payrollOtherEarnings.reduce(
        (total, earning) => total + earning.amount,
        0
    )
    const totalWorkEarnings = attendance.totalWorkMinutes * minuteRate
    const grossPay = totalWorkEarnings + totalOtherEarnings
    const lateDeduction = attendance.totalLateMinutes * minuteRate
    const totalDeductions = configuredDeductions + lateDeduction

    return {
        attendance,
        payroll: {
            salary: roundMoney(monthlySalary),
            dailyRate: roundMoney(dailyRate),
            hourlyRate: roundMoney(hourlyRate),
            totalWorkHoursDecimal:
                Math.round((attendance.totalWorkMinutes / 60) * 100) / 100,
            totalWorkEarnings: roundMoney(totalWorkEarnings),
            otherEarnings: payrollOtherEarnings,
            totalOtherEarnings: roundMoney(totalOtherEarnings),
            totalLateHoursDecimal:
                Math.round((attendance.totalLateMinutes / 60) * 100) / 100,
            lateDeduction: roundMoney(lateDeduction),
            payrollDeductions,
            totalPayrollDeductions: roundMoney(configuredDeductions),
            grossPay: roundMoney(grossPay),
            totalDeductions: roundMoney(totalDeductions),
            netPay: roundMoney(grossPay - totalDeductions),
        },
    }
}

export const payrollReportRules = {
    workingDaysPerMonth: WORKING_DAYS_PER_MONTH,
    workingHoursPerDay: WORKING_HOURS_PER_DAY,
}
