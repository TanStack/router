import { describe, expect, it } from 'vitest'
import { toExternalHydrationThenable } from '../src/externalHydration'

const EXTERNAL_HYDRATION_PROMISE = Symbol.for(
  'octane.external-hydration-promise',
)

describe('external hydration thenables', () => {
  it('returns a stable wrapper without mutating a frozen promise', async () => {
    const promise = Object.freeze(Promise.resolve('ready'))

    const first = toExternalHydrationThenable(promise)
    const second = toExternalHydrationThenable(promise)

    expect(first).toBe(second)
    expect(first).not.toBe(promise)
    expect(
      (first as PromiseLike<string> & Record<symbol, unknown>)[
        EXTERNAL_HYDRATION_PROMISE
      ],
    ).toBe(true)
    expect(await first).toBe('ready')
    expect(Object.getOwnPropertySymbols(promise)).not.toContain(
      EXTERNAL_HYDRATION_PROMISE,
    )
  })

  it('preserves synchronous fulfilled and rejected metadata', () => {
    const value = { date: new Date('2026-07-16T12:00:00.000Z') }
    const fulfilled = Object.freeze(
      Object.assign(Promise.resolve(value), {
        status: 'fulfilled' as const,
        value,
      }),
    )
    const reason = new Error('denied')
    const rejected = Object.freeze(
      Object.assign(Promise.resolve(undefined), {
        status: 'rejected' as const,
        reason,
      }),
    )

    const fulfilledWrapper = toExternalHydrationThenable(fulfilled) as any
    const rejectedWrapper = toExternalHydrationThenable(rejected) as any

    expect(fulfilledWrapper.status).toBe('fulfilled')
    expect(fulfilledWrapper.value).toBe(value)
    expect(rejectedWrapper.status).toBe('rejected')
    expect(rejectedWrapper.reason).toBe(reason)
  })

  it('does not expose incompatible status conventions to Octane', async () => {
    const promise = Object.freeze(
      Object.assign(Promise.resolve('ready'), {
        status: 'resolved' as const,
        value: 'ready',
      }),
    )
    const wrapper = toExternalHydrationThenable(promise) as any

    expect(wrapper.status).toBeUndefined()
    expect(await wrapper).toBe('ready')
  })

  it('isolates Octane tracking metadata from the source thenable', () => {
    const promise = Object.freeze(Promise.resolve('ready'))
    const wrapper = toExternalHydrationThenable(promise) as any
    const reason = new Error('local')

    wrapper.status = 'rejected'
    wrapper.reason = reason

    expect(wrapper.status).toBe('rejected')
    expect(wrapper.reason).toBe(reason)
    expect((promise as any).status).toBeUndefined()
    expect((promise as any).reason).toBeUndefined()
  })

  it('tolerates hostile metadata accessors', async () => {
    const thenable = {
      get status(): never {
        throw new Error('status is private')
      },
      then<TFulfilled = string, TRejected = never>(
        onfulfilled?:
          | ((value: string) => TFulfilled | PromiseLike<TFulfilled>)
          | null,
        onrejected?:
          | ((reason: any) => TRejected | PromiseLike<TRejected>)
          | null,
      ): PromiseLike<TFulfilled | TRejected> {
        return Promise.resolve('ready').then(onfulfilled, onrejected)
      },
    }
    const wrapper = toExternalHydrationThenable(thenable) as any

    expect(wrapper.status).toBeUndefined()
    expect(await wrapper).toBe('ready')
  })
})
