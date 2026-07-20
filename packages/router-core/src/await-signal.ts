export function waitForReason<T>(
  value: T | PromiseLike<T>,
  signal: AbortSignal,
  onLate?: (value: T) => void,
): Promise<T> {
  const promise = Promise.resolve(value)
  if (signal.aborted) {
    if (!onLate) {
      return Promise.race([Promise.reject(signal.reason), promise])
    }
    void promise.then(onLate, () => {})
    return Promise.reject(signal.reason)
  }
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    promise
      .then((result) => {
        if (signal.aborted) {
          onLate?.(result)
        } else {
          resolve(result)
        }
      }, reject)
      .finally(() => signal.removeEventListener('abort', abort))
  })
}
