export const OVERTIME_PURPOSE_MIN_LENGTH = 3
export const OVERTIME_PURPOSE_MAX_LENGTH = 5000

export function getOvertimePurposeError(purpose) {
    const length = purpose.trim().length
    if (length < OVERTIME_PURPOSE_MIN_LENGTH) {
        return 'Please enter a purpose with at least 3 characters (excluding surrounding spaces).'
    }
    if (length > OVERTIME_PURPOSE_MAX_LENGTH) {
        return 'Purpose must contain no more than 5,000 characters.'
    }
    return ''
}

export function getOvertimeSaveError(payload) {
    const error = payload?.error
    if (typeof error === 'string' && error.trim()) return error
    const messages = []
    if (error && typeof error === 'object') {
        for (const [field, errors] of Object.entries(error.fieldErrors ?? {})) {
            if (!Array.isArray(errors)) continue
            for (const message of errors) {
                if (typeof message === 'string')
                    messages.push(`${field}: ${message}`)
            }
        }
        if (Array.isArray(error.formErrors)) {
            messages.push(
                ...error.formErrors.filter(
                    message => typeof message === 'string'
                )
            )
        }
    }
    return (
        messages.join('\n') ||
        'Unable to save overtime request. Please try again.'
    )
}
