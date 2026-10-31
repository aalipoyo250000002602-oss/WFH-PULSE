import { format } from 'date-fns'

export const leaveSearchCountries = [
    { code: 'PH', name: 'Philippines' },
    { code: 'AU', name: 'Australia' },
    { code: 'US', name: 'United States' },
]

// Only public trip dates and the chosen country are included in outbound searches.
export function buildLeaveSearchLinks({
    startDate,
    endDate,
    countryCode = 'PH',
}) {
    const country =
        leaveSearchCountries.find(item => item.code === countryCode) ??
        leaveSearchCountries[0]
    const dateRange = `${format(startDate, 'MMMM d, yyyy')} to ${format(endDate, 'MMMM d, yyyy')}`
    return [
        { label: 'Events & festivals', topic: 'events festivals' },
        { label: 'Things to do', topic: 'things to do places to visit' },
        { label: 'Public holidays', topic: 'official public holidays' },
    ].map(({ label, topic }) => {
        const url = new URL('https://www.google.com/search')
        url.searchParams.set('q', `${country.name} ${topic} ${dateRange}`)
        return { label, country: country.name, url: url.toString() }
    })
}
