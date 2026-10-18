import assert from 'node:assert/strict'
import test from 'node:test'
import { addMonths, format } from 'date-fns'
import { generateLeavePlans, filterLeavePlans } from './leave-plans.mjs'

const now = new Date(2026, 9, 19, 17, 30)
const key = date => format(date, 'yyyy-MM-dd')

test('searches the full six-month window without the old first-20 cap', () => {
    const plans = generateLeavePlans({ credits: 4, now })
    assert.ok(plans.length > 100)
    assert.ok(plans.some(plan => key(plan.startDate).startsWith('2027-04')))
    for (const plan of plans) {
        assert.ok(key(plan.startDate) > '2026-10-19')
        assert.ok(key(plan.endDate) <= key(addMonths(now, 6)))
        assert.equal(plan.leaveCreditsUsed, 2)
    }
})

test('blocks pending and approved requests while allowing cancelled and denied ranges', () => {
    const requests = [
        { startDateKey: '2026-11-01', endDateKey: '2026-11-30', status: 'approved' },
        { startDateKey: '2026-12-01', endDateKey: '2026-12-31', status: 'pending' },
        { startDateKey: '2027-01-01', endDateKey: '2027-01-31', status: 'cancelled' },
        { startDateKey: '2027-02-01', endDateKey: '2027-02-28', status: 'denied' },
    ]
    const plans = generateLeavePlans({ credits: 4, requests, now })
    for (const request of requests.slice(0, 2)) {
        assert.ok(plans.every(plan => key(plan.endDate) < request.startDateKey || key(plan.startDate) > request.endDateKey))
    }
    assert.ok(plans.some(plan => key(plan.startDate) === '2027-01-04'))
    assert.ok(plans.some(plan => key(plan.startDate) === '2027-02-01'))
})

test('includes following weekends and holidays without charging additional credits', () => {
    const plans = generateLeavePlans({
        credits: 2, now,
        holidays: [{ date: '2026-10-26', name: 'Company holiday' }],
    })
    const friday = plans.find(plan => key(plan.startDate) === '2026-10-23')
    assert.equal(key(friday.endDate), '2026-10-26')
    assert.equal(friday.leaveCreditsUsed, 1)
    assert.equal(friday.spanDays, 4)
    assert.equal(friday.weekendDays, 2)
    assert.deepEqual(friday.holidayNames, ['Company holiday'])
})

test('month and holiday filters combine and sorting prioritizes time off or earliest dates', () => {
    const plans = generateLeavePlans({ credits: 4, now, holidays: [
        { date: '2026-12-25', name: 'Christmas' },
        { date: '2027-01-01', name: 'New Year' },
    ] })
    const december = filterLeavePlans(plans, { month: '2026-12', holidayOnly: true })
    assert.ok(december.length > 0)
    assert.ok(december.every(plan => key(plan.startDate).startsWith('2026-12') && plan.holidayNames.length > 0))
    assert.ok(december.every((plan, index) => index === 0 || december[index - 1].spanDays >= plan.spanDays))
    const soonest = filterLeavePlans(plans, { sort: 'soonest' })
    assert.ok(soonest.every((plan, index) => index === 0 || soonest[index - 1].startDate <= plan.startDate))
    assert.deepEqual(filterLeavePlans(plans, { month: '2028-01' }), [])
})

test('never proposes leave with zero, fractional-only, or invalid available credits', () => {
    for (const credits of [0, .5, -1, NaN, Infinity]) {
        assert.deepEqual(generateLeavePlans({ credits, now }), [])
    }
})

test('the six-month boundary clamps to the last day of short months', () => {
    const plans = generateLeavePlans({ credits: 2, now: new Date(2026, 7, 31) })
    assert.ok(plans.length > 0)
    assert.ok(plans.every(plan => key(plan.endDate) <= '2027-02-28'))
})
