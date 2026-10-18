import { Capacitor, registerPlugin } from '@capacitor/core'

const ReportFiles = registerPlugin('ReportFiles')

const readBlob = blob =>
    new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result).split(',')[1])
        reader.onerror = () =>
            reject(new Error('Unable to read the report file.'))
        reader.onabort = () =>
            reject(new Error('Reading the report was interrupted.'))
        reader.readAsDataURL(blob)
    })

// Keep report generation independent of how each platform saves the resulting bytes.
export async function downloadReportFile(blob, fileName, options = {}) {
    const platform = options.platform ?? Capacitor.getPlatform()
    if (platform === 'android' || platform === 'ios') {
        const data = await (options.readBlob ?? readBlob)(blob)
        return await (options.native ?? ReportFiles).saveFile({
            fileName,
            mimeType: blob.type.split(';')[0] || 'application/octet-stream',
            data,
        })
    }
    if (platform !== 'web') {
        throw new Error('Report downloads are not available on this platform.')
    }

    const doc = options.document ?? globalThis.document
    const urls = options.url ?? globalThis.URL
    const schedule = options.schedule ?? globalThis.setTimeout
    const url = urls.createObjectURL(blob)
    const link = doc.createElement('a')
    try {
        link.href = url
        link.download = fileName
        link.style.display = 'none'
        doc.body.appendChild(link)
        link.click()
    } finally {
        link.remove()
        // Give browsers time to consume the blob before releasing it.
        schedule(() => urls.revokeObjectURL(url), 60_000)
    }
    return { cancelled: false }
}
