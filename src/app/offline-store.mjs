// Each update is one IndexedDB read/write transaction: a successful save is durable before UI acknowledgement.
export function createOfflineStore(indexedDB = globalThis.indexedDB) {
    let opening
    const open = () => opening ??= new Promise((resolve, reject) => {
        if (!indexedDB) return reject(new Error('Persistent device storage is unavailable.'))
        const request = indexedDB.open('wfh-pulse-offline-v1', 1)
        request.onupgradeneeded = () => request.result.createObjectStore('accounts')
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
        request.onblocked = () => reject(new Error('Device storage is busy in another window.'))
    })
    const empty = () => ({ operations: [], cache: {}, aliases: {}, lastSyncedAt: null })
    async function transaction(key, change) {
        const db = await open()
        return new Promise((resolve, reject) => {
            const tx = db.transaction('accounts', change ? 'readwrite' : 'readonly')
            const store = tx.objectStore('accounts')
            const request = store.get(key)
            let value
            let error
            request.onsuccess = () => {
                value = request.result ?? empty()
                try { if (change) { change(value); store.put(value, key) } }
                catch (cause) { error = cause; tx.abort() }
            }
            tx.oncomplete = () => resolve(value)
            tx.onabort = tx.onerror = () => reject(error ?? tx.error ?? new Error('Device storage could not be saved.'))
        })
    }
    return { read: key => transaction(key), update: (key, change) => transaction(key, change) }
}
