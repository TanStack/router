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
