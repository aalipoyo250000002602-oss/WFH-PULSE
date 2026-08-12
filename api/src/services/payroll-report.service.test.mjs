import test from 'node:test'
import assert from 'node:assert/strict'
import {
    calculatePayrollReport,
    payrollReportRules,
} from './payroll-report.service.mjs'

test('calculates employee-specific gross pay and deductions from attendance', () => {
    const report = calculatePayrollReport({
        salary: 21000,
        deductions: [{ id: 'tax', name: 'Tax', amount: 500 }],
        records: [
            {
                status: 'present',
                workDurationMinutes: 480,
                lateMinutes: 0,
            },
            {
                status: 'late',
                workDurationMinutes: 480,
                lateMinutes: 60,
            },
            {
                status: 'absent',
                workDurationMinutes: 0,
                lateMinutes: 0,
            },
        ],
    })

    assert.equal(payrollReportRules.workingDaysPerMonth, 21)
    assert.equal(report.attendance.presentDays, 2)
    assert.equal(report.attendance.absentDays, 1)
    assert.equal(report.attendance.lateDays, 1)
    assert.equal(report.payroll.dailyRate, 1000)
    assert.equal(report.payroll.hourlyRate, 125)
    assert.equal(report.payroll.grossPay, 2000)
    assert.equal(report.payroll.lateDeduction, 125)
    assert.equal(report.payroll.totalDeductions, 625)
    assert.equal(report.payroll.netPay, 1375)
})

test('uses each employee salary when calculating the same attendance', () => {
    const records = [
        {
            status: 'present',
            workDurationMinutes: 480,
            lateMinutes: 0,
        },
    ]
    const firstEmployee = calculatePayrollReport({ salary: 21000, records })
    const secondEmployee = calculatePayrollReport({ salary: 42000, records })

    assert.equal(firstEmployee.payroll.grossPay, 1000)
    assert.equal(secondEmployee.payroll.grossPay, 2000)
})

test('adds other earnings to gross and net pay', () => {
    const report = calculatePayrollReport({
        salary: 21000,
        otherEarnings: [
            { id: 'bonus', name: 'Performance Bonus', amount: 750 },
        ],
        deductions: [{ id: 'tax', name: 'Tax', amount: 100 }],
        records: [
            {
                status: 'present',
                workDurationMinutes: 480,
                lateMinutes: 0,
            },
        ],
    })

    assert.equal(report.payroll.totalWorkEarnings, 1000)
    assert.equal(report.payroll.totalOtherEarnings, 750)
    assert.equal(report.payroll.grossPay, 1750)
    assert.equal(report.payroll.netPay, 1650)
})

test('normalizes invalid and negative amounts to zero', () => {
    const report = calculatePayrollReport({
        salary: 'invalid',
        deductions: [{ id: 'bad', name: 'Bad', amount: -100 }],
        records: [
            {
                status: 'absent',
                workDurationMinutes: -20,
                lateMinutes: -5,
            },
        ],
    })

    assert.equal(report.payroll.grossPay, 0)
    assert.equal(report.payroll.totalDeductions, 0)
    assert.equal(report.payroll.netPay, 0)
})
