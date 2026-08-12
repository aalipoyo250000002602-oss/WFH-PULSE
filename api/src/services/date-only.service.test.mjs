import test from 'node:test'
import assert from 'node:assert/strict'
import { formatDateOnly } from './date-only.service.mjs'

test('formats PostgreSQL-style Date objects with the current year intact', () => {
    const julyDate = new Date(2026, 6, 1)

    assert.equal(formatDateOnly(julyDate), '2026-07-01')
})

test('keeps ISO date strings unchanged', () => {
    assert.equal(formatDateOnly('2026-07-31'), '2026-07-31')
})

test('does not turn display-formatted dates into year 2001 values', () => {
    assert.equal(formatDateOnly('Wed Jul 01 2026'), '')
})
