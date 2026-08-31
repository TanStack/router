export function waitForReason<T>(
  value: T | PromiseLike<T>,
  signal: AbortSignal,
  onLate?: (value: T) => void,
  onLateError?: (reason: unknown) => void,
): Promise<T> {
  const promise = Promise.resolve(value)
  if (signal.aborted) {
    void promise.then(onLate, onLateError).catch(() => {})
    return Promise.reject(signal.reason)
  }

  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener('abort', abort)
      reject(signal.reason)
    }
    signal.addEventListener('abort', abort, { once: true })
    void promise
      .then(
        (result) => {
          if (signal.aborted) {
            return onLate?.(result)
          } else {
            resolve(result)
          }
        },
        (error) => {
          if (signal.aborted) {
            return onLateError?.(error)
          } else {
            reject(error)
          }
        },
      )
      .finally(() => signal.removeEventListener('abort', abort))
      .catch(() => {})
  })
}
