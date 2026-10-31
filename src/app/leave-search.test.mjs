import assert from 'node:assert/strict'
import test from 'node:test'
import { buildLeaveSearchLinks, leaveSearchCountries } from './leave-search.mjs'

const dates = {
    startDate: new Date(2026, 11, 30),
    endDate: new Date(2027, 0, 3),
}

test('Google searches include the selected country and full dates across years', () => {
    for (const country of leaveSearchCountries) {
        const links = buildLeaveSearchLinks({
            ...dates,
            countryCode: country.code,
        })
        assert.equal(links.length, 3)
        for (const link of links) {
            const url = new URL(link.url)
            assert.equal(url.origin, 'https://www.google.com')
            assert.equal(url.pathname, '/search')
            const query = url.searchParams.get('q')
            assert.ok(query.startsWith(country.name + ' '))
            assert.ok(query.endsWith('December 30, 2026 to January 3, 2027'))
            assert.deepEqual([...url.searchParams.keys()], ['q'])
        }
    }
})

test('searches default to the Philippines and ignore unsupported countries', () => {
    const defaults = buildLeaveSearchLinks(dates)
    assert.deepEqual(
        buildLeaveSearchLinks({ ...dates, countryCode: 'invalid' }),
        defaults
    )
    assert.ok(defaults.every(link => link.country === 'Philippines'))
})
