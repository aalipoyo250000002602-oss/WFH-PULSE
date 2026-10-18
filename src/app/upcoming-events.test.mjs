import assert from 'node:assert/strict'
import test from 'node:test'
import { getUpcomingEvents } from './upcoming-events.mjs'

test('ignores stale countdowns and includes only today through six calendar months', () => {
    const events = [
        { id: 'past', date: '2026-10-18', daysUntil: 30 },
        { id: 'end', date: '2027-04-19', daysUntil: -1 },
        { id: 'beyond', date: '2027-04-20', daysUntil: 2 },
        { id: 'today', date: '2026-10-19', daysUntil: -10 },
        { id: 'tomorrow', date: '2026-10-20', daysUntil: 500 },
    ]
    const result = getUpcomingEvents(events, new Date(2026, 9, 19, 23, 59))
    assert.deepEqual(result.map(event => [event.id, event.daysUntil]), [
        ['today', 0], ['tomorrow', 1], ['end', 182],
    ])
    assert.equal(events[0].daysUntil, 30, 'must not modify shared calendar data')
})

test('clamps the six-month cutoff at month end, including leap years', () => {
    for (const [year, lastDay] of [[2023, 29], [2024, 28]]) {
        const result = getUpcomingEvents([
            { date: `${year + 1}-02-${lastDay}` },
            { date: `${year + 1}-03-01` },
        ], new Date(year, 7, 31))
        assert.equal(result.length, 1)
        assert.equal(result[0].date, `${year + 1}-02-${lastDay}`)
    }
})

test('handles local calendar days across daylight-saving changes', () => {
    const result = getUpcomingEvents([
        { date: '2026-03-09' },
    ], new Date(2026, 2, 7, 12))
    assert.equal(result[0].daysUntil, 2)
})

test('excludes invalid dates and returns an empty list when nothing is upcoming', () => {
    assert.deepEqual(getUpcomingEvents([
        { date: 'invalid' },
        { date: '2026-02-30' },
        { date: '2026-01-01' },
    ], new Date(2026, 9, 19)), [])
    assert.deepEqual(getUpcomingEvents([], new Date(2026, 9, 19)), [])
})
