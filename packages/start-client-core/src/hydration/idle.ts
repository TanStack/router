import type { HydrationPrefetchStrategy, HydrationStrategy } from './types'

const idleType = 'idle'

export type IdleHydrationOptions = {
  timeout?: number
}

function getIdleScheduler() {
  return globalThis as unknown as {
    requestIdleCallback?: (
      callback: IdleRequestCallback,
      options?: IdleRequestOptions,
    ) => number
    cancelIdleCallback?: (handle: number) => void
  }
}

function scheduleIdle(callback: () => void, timeout: number) {
  const schedule = getIdleScheduler()
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
): HydrationStrategy & HydrationPrefetchStrategy {
  const timeout = options.timeout ?? 2000

  return {
    type: idleType,
    key: `${idleType}:${timeout}`,
    setup: ({ gate }) => scheduleIdle(gate.resolve, timeout),
    setupPrefetch: ({ prefetch }) => scheduleIdle(prefetch, timeout),
  }
}
