import { useEffect, useState } from 'react'
import { CheckCircle2, CloudOff, RefreshCw, AlertTriangle } from 'lucide-react'
import { getOfflineSyncStatus, subscribeOfflineSync, retryOfflineSync, discardOfflineOperation } from '../api-fetch.mjs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { Button } from './ui/button'

export function OfflineSyncStatus() {
    const [status, setStatus] = useState(getOfflineSyncStatus)
    const [open, setOpen] = useState(false)
    const [discardId, setDiscardId] = useState<string | null>(null)
    useEffect(() => subscribeOfflineSync(setStatus), [])
    if (!status.enabled) return null
    const Icon = status.failedCount ? AlertTriangle : status.syncing ? RefreshCw
        : status.pendingCount || !status.connected ? CloudOff : CheckCircle2
    const label = status.failedCount ? `${status.failedCount} need attention` : status.syncing ? 'Syncing saved actions…'
        : status.pendingCount ? `${status.pendingCount} unsynced` : !status.connected ? 'Offline · saved on device' : 'Synced'
    return (
        <>
            <Button type="button" variant="outline" size="icon" onClick={() => setOpen(true)}
                className="h-9 w-9" title={label} aria-label={`Sync status: ${label}`}>
                <Icon className={`h-4 w-4 ${status.failedCount ? 'text-destructive' : status.syncing
                    ? 'animate-spin text-vibrant-blue' : status.pendingCount || !status.connected
                    ? 'text-vibrant-orange' : 'text-vibrant-green'}`} />
                <span className="sr-only" role="status" aria-live="polite">{label}</span>
            </Button>
            <Dialog open={open} onOpenChange={value => { setOpen(value); setDiscardId(null) }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Device sync</DialogTitle>
                        <DialogDescription>Saved actions sync automatically when the app is open or resumes with a connection. Slack clock-in/out messages are queued after the action syncs.</DialogDescription>
                    </DialogHeader>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-sm">{status.error || (status.pendingCount ? 'These actions have not all reached the server yet.' : 'All saved actions have synced.')}</p>
                    <div className="max-h-64 space-y-3 overflow-y-auto">
                        {status.operations.map((op: any) => (
                            <div key={op.operationId} className="rounded-md border p-3 text-sm">
                                <p>{op.path.replace('/me/', '').replaceAll('/', ' · ').replaceAll('-', ' ')}</p>
                                <p className="text-xs text-muted-foreground">{new Date(op.occurredAt).toLocaleString()}</p>
                                {op.error && <p className="mt-1 text-destructive">{op.error}</p>}
                                {op.error && <Button variant="ghost" size="sm" onClick={() => setDiscardId(op.operationId)}>Discard saved action</Button>}
                            </div>
                        ))}
                    </div>
                    {discardId && <div className="space-y-2 rounded-md border border-destructive p-3 text-sm">
                        <p>Discard this unsynced action and any edits that depend on it? It will not be sent to the server.</p>
                        <Button variant="destructive" onClick={async () => { await discardOfflineOperation(discardId); setDiscardId(null) }}>Confirm discard</Button>
                        <Button variant="ghost" onClick={() => setDiscardId(null)}>Keep it</Button>
                    </div>}
                    <Button disabled={status.syncing || !status.pendingCount} onClick={() => { void retryOfflineSync() }}>
                        <RefreshCw className={`mr-2 h-4 w-4 ${status.syncing ? 'animate-spin' : ''}`} />Retry sync
                    </Button>
                </DialogContent>
            </Dialog>
        </>
    )
}
