const EXTERNAL_HYDRATION_PROMISE = Symbol.for(
  'octane.external-hydration-promise',
)

type ExternalHydrationThenable<T> = PromiseLike<T> & {
  [EXTERNAL_HYDRATION_PROMISE]: true
  status?: ThenableStatus
  value?: T
  reason?: unknown
}

type ThenableStatus = 'pending' | 'fulfilled' | 'rejected'

const externalHydrationThenables = new WeakMap<
  object,
  ExternalHydrationThenable<unknown>
>()

/**
 * Wrap a router-owned promise so Octane still schedules its suspense boundary,
 * while TanStack's serializer remains the only owner of its hydration value.
 */
export function toExternalHydrationThenable<T>(
  thenable: PromiseLike<T>,
): PromiseLike<T> {
  const key = thenable as object
  const existing = externalHydrationThenables.get(key)
  if (existing) {
    return existing as ExternalHydrationThenable<T>
  }

  let localStatus: ThenableStatus | undefined
  let localValue: T | undefined
  let localReason: unknown
  let hasLocalValue = false
  let hasLocalReason = false

  const externalThenable: ExternalHydrationThenable<T> = {
    [EXTERNAL_HYDRATION_PROMISE]: true,
    get status() {
      return localStatus ?? readThenableStatus(thenable)
    },
    set status(status) {
      localStatus = status
    },
    get value(): T | undefined {
      return hasLocalValue
        ? localValue
        : readThenableProperty<T>(thenable, 'value')
    },
    set value(value: T | undefined) {
      hasLocalValue = true
      localValue = value
    },
    get reason(): unknown {
      return hasLocalReason
        ? localReason
        : readThenableProperty<unknown>(thenable, 'reason')
    },
    set reason(reason) {
      hasLocalReason = true
      localReason = reason
    },
    then(onfulfilled, onrejected) {
      return thenable.then(onfulfilled, onrejected)
    },
  }
  externalHydrationThenables.set(key, externalThenable)
  return externalThenable
}

function readThenableStatus(thenable: PromiseLike<unknown>) {
  const status = readThenableProperty(thenable, 'status')
  return status === 'pending' || status === 'fulfilled' || status === 'rejected'
    ? status
    : undefined
}

function readThenableProperty<T>(
  thenable: PromiseLike<unknown>,
  property: 'status' | 'value' | 'reason',
): T | undefined {
  try {
    return (thenable as PromiseLike<unknown> & Record<string, T>)[property]
  } catch {
    return undefined
  }
}
