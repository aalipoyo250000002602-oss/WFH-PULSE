// Credentials stay in native secure storage, never in the IndexedDB action queue.
export function createOfflineSessionVault({ storage, key, keychainAccess }) {
    /** @type {Promise<unknown>} */
    let pending = Promise.resolve()
    /**
     * @template T
     * @param {() => T | PromiseLike<T>} operation
     * @returns {Promise<T>}
     */
    function serialize(operation) {
        const next = pending.catch(() => {}).then(operation)
        pending = next
        return next
    }
    return {
        read: () => serialize(() => storage.get(key, false, false)),
        remember: session => serialize(() => storage.set(key, session, false, false, keychainAccess)),
        forget: () => serialize(() => storage.remove(key, false)),
    }
}
