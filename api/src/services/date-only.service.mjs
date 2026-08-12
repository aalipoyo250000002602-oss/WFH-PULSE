export function formatDateOnly(value) {
    if (value instanceof Date) {
        const year = value.getFullYear()
        const month = String(value.getMonth() + 1).padStart(2, '0')
        const day = String(value.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
    }

    const text = String(value ?? '')
    const isoDate = text.match(/^\d{4}-\d{2}-\d{2}/)?.[0]
    return isoDate ?? ''
}
