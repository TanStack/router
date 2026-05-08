import type { HydrationPrefetchStrategy } from './types'

const idleType = 'idle'

export type IdleHydrationOptions = {
  timeout?: number
}

type IdleScheduler = {
  requestIdleCallback?: (
    callback: IdleRequestCallback,
    options?: IdleRequestOptions,
  ) => number
  cancelIdleCallback?: (handle: number) => void
}

export function scheduleIdle(callback: () => void, timeout: number) {
  const schedule = globalThis as unknown as IdleScheduler
  if (schedule.requestIdleCallback) {
    const handle = schedule.requestIdleCallback(callback, { timeout })
    return () => schedule.cancelIdleCallback?.(handle)
  }

  const timeoutId = globalThis.setTimeout(callback, timeout)
  return () => globalThis.clearTimeout(timeoutId)
}

/* @__NO_SIDE_EFFECTS__ */
export function idle(
  options: IdleHydrationOptions = {},
): HydrationPrefetchStrategy<typeof idleType> {
  const timeout = options.timeout ?? 2000

  return {
    _t: idleType,
    _s: ({ gate, prefetch }) =>
      scheduleIdle(prefetch ?? gate!.resolve, timeout),
  }
}
