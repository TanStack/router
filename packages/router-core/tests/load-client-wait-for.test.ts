import { describe, expect, test, vi } from 'vitest'
import { waitForReason } from '../src/await-signal'
import { waitFor } from '../src/load-client'

describe('waitFor', () => {
  test('observes a rejected value when the signal is already aborted', async () => {
    const controller = new AbortController()
    const error = new Error('late failure')
    controller.abort()

    await expect(waitFor(undefined, controller.signal)).rejects.toBe(
      controller.signal,
    )
    await expect(
      waitFor(Promise.reject(error), controller.signal),
    ).rejects.toBe(controller.signal)

    await Promise.resolve()
  })

  test('preserves reason-based cancellation and observes a late value', async () => {
    const controller = new AbortController()
    const reason = new Error('request canceled')
    const late = Promise.resolve('late response')
    const onLate = vi.fn()
    controller.abort(reason)

    await expect(waitForReason(late, controller.signal, onLate)).rejects.toBe(
      reason,
    )
    await vi.waitFor(() => expect(onLate).toHaveBeenCalledWith('late response'))
  })
})

describe('waitForReason', () => {
  test('removes its abort listener when a wait settles', async () => {
    const controller = new AbortController()
    const addEventListener = vi.spyOn(controller.signal, 'addEventListener')
    const removeEventListener = vi.spyOn(
      controller.signal,
      'removeEventListener',
    )

    await expect(
      waitForReason(Promise.resolve('value'), controller.signal),
    ).resolves.toBe('value')
    expect(addEventListener).toHaveBeenCalledTimes(1)
    expect(removeEventListener).toHaveBeenCalledTimes(1)
  })

  test('rejects all active waits and observes their late values', async () => {
    const controller = new AbortController()
    const removeEventListener = vi.spyOn(
      controller.signal,
      'removeEventListener',
    )
    const reason = new Error('request canceled')
    const onFirstLate = vi.fn()
    const onSecondLate = vi.fn()
    let resolveFirst!: (value: string) => void
    let resolveSecond!: (value: string) => void
    const first = new Promise<string>((resolve) => {
      resolveFirst = resolve
    })
    const second = new Promise<string>((resolve) => {
      resolveSecond = resolve
    })
    const firstResult = waitForReason(first, controller.signal, onFirstLate)
    const secondResult = waitForReason(second, controller.signal, onSecondLate)

    controller.abort(reason)
    await expect(firstResult).rejects.toBe(reason)
    await expect(secondResult).rejects.toBe(reason)
    expect(removeEventListener).toHaveBeenCalledTimes(2)

    resolveFirst('first')
    resolveSecond('second')
    await vi.waitFor(() => {
      expect(onFirstLate).toHaveBeenCalledWith('first')
      expect(onSecondLate).toHaveBeenCalledWith('second')
    })
  })

  test('observes fulfilled and rejected values when already aborted', async () => {
    const controller = new AbortController()
    const reason = new Error('request canceled')
    const lateError = new Error('late failure')
    const onLate = vi.fn()
    const onLateError = vi.fn()
    controller.abort(reason)

    await expect(
      waitForReason(Promise.resolve('late'), controller.signal, onLate),
    ).rejects.toBe(reason)
    await expect(
      waitForReason(
        Promise.reject(lateError),
        controller.signal,
        undefined,
        onLateError,
      ),
    ).rejects.toBe(reason)

    await vi.waitFor(() => {
      expect(onLate).toHaveBeenCalledWith('late')
      expect(onLateError).toHaveBeenCalledWith(lateError)
    })
  })

  test('observes errors from late callbacks', async () => {
    const unhandled: Array<unknown> = []
    const onUnhandled = (error: unknown) => {
      unhandled.push(error)
    }
    process.on('unhandledRejection', onUnhandled)

    try {
      const reason = new Error('request canceled')
      const thrownError = new Error('late callback threw')
      const rejectedError = new Error('late callback rejected')
      const throwLate = vi.fn(() => {
        throw thrownError
      })
      const rejectLate = vi.fn(() => {
        return Promise.reject(rejectedError)
      })
      const expectCanceled = (promise: Promise<unknown>) => {
        return expect(promise).rejects.toBe(reason)
      }
      const alreadyAborted = new AbortController()
      alreadyAborted.abort(reason)

      await Promise.all([
        expectCanceled(
          waitForReason(
            Promise.resolve('late'),
            alreadyAborted.signal,
            throwLate,
          ),
        ),
        expectCanceled(
          waitForReason(
            Promise.reject(new Error('late failure')),
            alreadyAborted.signal,
            undefined,
            rejectLate,
          ),
        ),
      ])

      const controller = new AbortController()
      const fulfilledWait = waitForReason(
        Promise.resolve('late'),
        controller.signal,
        rejectLate,
      )
      const rejectedWait = waitForReason(
        Promise.reject(new Error('late failure')),
        controller.signal,
        undefined,
        throwLate,
      )
      controller.abort(reason)

      await Promise.all([
        expectCanceled(fulfilledWait),
        expectCanceled(rejectedWait),
      ])
      await new Promise<void>((resolve) => setTimeout(resolve, 0))

      expect(throwLate).toHaveBeenCalledTimes(2)
      expect(rejectLate).toHaveBeenCalledTimes(2)
      expect(unhandled).not.toContain(thrownError)
      expect(unhandled).not.toContain(rejectedError)
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })
})
