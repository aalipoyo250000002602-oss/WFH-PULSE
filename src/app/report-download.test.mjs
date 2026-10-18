import assert from 'node:assert/strict'
import test from 'node:test'
import { downloadReportFile } from './report-download.mjs'

for (const platform of ['android', 'ios']) {
    test(`${platform} sends report bytes and MIME type to the native saver, without browser downloads`, async () => {
        for (const [fileName, mimeType, content] of [
            [
                'attendance.csv',
                'text/csv;charset=utf-8;',
                '\uFEFFEmployee,Hours\nJosé,8',
            ],
            ['payslip.html', 'text/html', '<html><body>₱1,250</body></html>'],
        ]) {
            const blob = new Blob([content], { type: mimeType })
            let payload
            let finishSave
            let finished = false
            const pending = downloadReportFile(blob, fileName, {
                platform,
                readBlob: async input =>
                    Buffer.from(await input.arrayBuffer()).toString('base64'),
                native: {
                    saveFile: value => {
                        payload = value
                        return new Promise(resolve => {
                            finishSave = resolve
                        })
                    },
                },
            }).then(result => {
                finished = true
                return result
            })
            await new Promise(resolve => setImmediate(resolve))
            assert.equal(
                finished,
                false,
                'must wait for the native write to complete'
            )
            assert.equal(payload.fileName, fileName)
            assert.equal(payload.mimeType, mimeType.split(';')[0])
            assert.equal(
                Buffer.from(payload.data, 'base64').toString('utf8'),
                content
            )
            finishSave({ cancelled: false })
            assert.deepEqual(await pending, { cancelled: false })
        }
    })

    test(`${platform} cancellation is preserved so the caller does not claim a successful save`, async () => {
        const result = await downloadReportFile(
            new Blob(['report']),
            'report.csv',
            {
                platform,
                readBlob: async () => 'cmVwb3J0',
                native: { saveFile: async () => ({ cancelled: true }) },
            }
        )
        assert.deepEqual(result, { cancelled: true })
    })

    test(`${platform} native write failures reach the caller for error feedback`, async () => {
        await assert.rejects(
            downloadReportFile(new Blob(['report']), 'report.csv', {
                platform,
                readBlob: async () => 'cmVwb3J0',
                native: {
                    saveFile: async () => {
                        throw new Error('Storage is full')
                    },
                },
            }),
            /Storage is full/
        )
    })

    test(`${platform} a failed blob read never opens the native save dialog`, async () => {
        await assert.rejects(
            downloadReportFile(new Blob(['report']), 'report.csv', {
                platform,
                readBlob: async () => {
                    throw new Error('Unable to read')
                },
                native: {
                    saveFile: () =>
                        assert.fail('must not save unreadable data'),
                },
            }),
            /Unable to read/
        )
    })
}

function browserOptions(failClick = false) {
    const events = []
    const link = {
        style: {},
        click() {
            events.push('click')
            if (failClick) throw new Error('Download failed')
        },
        remove() {
            events.push('remove')
        },
    }
    let cleanup
    return {
        link,
        events,
        cleanup: () => cleanup(),
        options: {
            platform: 'web',
            document: {
                createElement: () => link,
                body: { appendChild: () => events.push('append') },
            },
            url: {
                createObjectURL: () => 'blob:report',
                revokeObjectURL: value => events.push(`revoke ${value}`),
            },
            schedule: (fn, delay) => {
                assert.equal(delay, 60_000)
                cleanup = fn
            },
        },
    }
}

test('browser downloads retain the filename and release the URL after consumption', async () => {
    const browser = browserOptions()
    assert.deepEqual(
        await downloadReportFile(
            new Blob(['report']),
            'report.csv',
            browser.options
        ),
        { cancelled: false }
    )
    assert.equal(browser.link.download, 'report.csv')
    assert.equal(browser.link.href, 'blob:report')
    assert.deepEqual(browser.events, ['append', 'click', 'remove'])
    browser.cleanup()
    assert.deepEqual(browser.events, [
        'append',
        'click',
        'remove',
        'revoke blob:report',
    ])
})

test('failed browser downloads still clean up the element and blob URL', async () => {
    const browser = browserOptions(true)
    await assert.rejects(
        downloadReportFile(new Blob(['report']), 'report.csv', browser.options),
        /Download failed/
    )
    browser.cleanup()
    assert.deepEqual(browser.events, [
        'append',
        'click',
        'remove',
        'revoke blob:report',
    ])
})

test('unsupported native platforms report an error instead of falsely claiming a download', async () => {
    await assert.rejects(
        downloadReportFile(new Blob(['report']), 'report.csv', {
            platform: 'unknown',
        }),
        /not available on this platform/
    )
})
