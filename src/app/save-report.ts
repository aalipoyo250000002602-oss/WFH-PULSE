import { toast } from 'sonner'
import { downloadReportFile } from './report-download.mjs'

export async function saveReport(
    blob: Blob,
    fileName: string,
    successMessage = 'Report saved successfully'
) {
    try {
        const result = await downloadReportFile(blob, fileName)
        if (!result.cancelled) toast.success(successMessage)
    } catch (error) {
        toast.error(
            error instanceof Error
                ? error.message
                : 'Unable to save the report. Please try again.'
        )
    }
}
