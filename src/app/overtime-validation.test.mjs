import assert from 'node:assert/strict'
import test from 'node:test'
import {
    getOvertimePurposeError,
    getOvertimeSaveError,
} from './overtime-validation.mjs'

test('rejects the reported two-character purpose and trimmed short input', () => {
    for (const purpose of ['ds', '', '   ', ' ds ', 'a ']) {
        assert.match(getOvertimePurposeError(purpose), /at least 3 characters/)
    }
})

test('accepts valid trimmed purposes up to the API limit', () => {
    assert.equal(getOvertimePurposeError('abc'), '')
    assert.equal(getOvertimePurposeError('  Complete monthly reporting  '), '')
    assert.equal(getOvertimePurposeError('x'.repeat(5000)), '')
    assert.match(getOvertimePurposeError('x'.repeat(5001)), /5,000/)
})

test('converts the reported API validation object into a readable message', () => {
    assert.equal(
        getOvertimeSaveError({
            error: {
                formErrors: [],
                fieldErrors: {
                    purpose: ['String must contain at least 3 character(s)'],
                },
            },
        }),
        'purpose: String must contain at least 3 character(s)'
    )
})

test('preserves business-rule errors and handles missing error details', () => {
    assert.equal(
        getOvertimeSaveError({ error: 'Overtime overlaps working hours.' }),
        'Overtime overlaps working hours.'
    )
    assert.equal(
        getOvertimeSaveError({
            error: { formErrors: ['Invalid request'], fieldErrors: {} },
        }),
        'Invalid request'
    )
    assert.match(getOvertimeSaveError({}), /Unable to save overtime request/)
})
