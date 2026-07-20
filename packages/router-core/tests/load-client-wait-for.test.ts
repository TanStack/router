import { describe, expect, test, vi } from 'vitest'
import { waitForReason } from '../src/await-signal'
import { waitFor } from '../src/load-client'
import { waitForRequest } from '../src/ssr/createRequestHandler'

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

describe('waitForRequest', () => {
  test('shares one abort listener across concurrent and sequential waits', async () => {
    const controller = new AbortController()
    const addEventListener = vi.spyOn(controller.signal, 'addEventListener')
    let resolveFirst!: (value: string) => void
    let resolveSecond!: (value: string) => void
    let resolveThird!: (value: string) => void
    const first = new Promise<string>((resolve) => {
      resolveFirst = resolve
    })
    const second = new Promise<string>((resolve) => {
      resolveSecond = resolve
    })
    const third = new Promise<string>((resolve) => {
      resolveThird = resolve
    })

    const firstResult = waitForRequest(first, controller.signal)
    const secondResult = waitForRequest(second, controller.signal)

    expect(addEventListener).toHaveBeenCalledTimes(1)
    resolveFirst('first')
    resolveSecond('second')
    await expect(firstResult).resolves.toBe('first')
    await expect(secondResult).resolves.toBe('second')

    const thirdResult = waitForRequest(third, controller.signal)
    expect(addEventListener).toHaveBeenCalledTimes(1)

    const reason = new Error('request canceled')
    controller.abort(reason)
    await expect(thirdResult).rejects.toBe(reason)
    resolveThird('third')
    await Promise.resolve()
  })

  test('rejects all active waits and observes their late values', async () => {
    const controller = new AbortController()
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
    const firstResult = waitForRequest(first, controller.signal, onFirstLate)
    const secondResult = waitForRequest(second, controller.signal, onSecondLate)

    controller.abort(reason)
    await expect(firstResult).rejects.toBe(reason)
    await expect(secondResult).rejects.toBe(reason)

    resolveFirst('first')
    resolveSecond('second')
    await vi.waitFor(() => {
      expect(onFirstLate).toHaveBeenCalledWith('first')
      expect(onSecondLate).toHaveBeenCalledWith('second')
    })
  })

  test('aborts remaining waits after an out-of-order rejection', async () => {
    const controller = new AbortController()
    const reason = new Error('request canceled')
    const failure = new Error('wait failed')
    const onLate = vi.fn()
    let resolveFirst!: (value: string) => void
    let rejectSecond!: (error: Error) => void
    let rejectThird!: (error: Error) => void
    const first = new Promise<string>((resolve) => {
      resolveFirst = resolve
    })
    const second = new Promise<string>((_, reject) => {
      rejectSecond = reject
    })
    const third = new Promise<string>((_, reject) => {
      rejectThird = reject
    })
    const firstResult = waitForRequest(first, controller.signal, onLate)
    const secondResult = waitForRequest(second, controller.signal)
    const thirdResult = waitForRequest(third, controller.signal)

    rejectSecond(failure)
    await expect(secondResult).rejects.toBe(failure)

    controller.abort(reason)
    await expect(firstResult).rejects.toBe(reason)
    await expect(thirdResult).rejects.toBe(reason)

    resolveFirst('late')
    rejectThird(new Error('late failure'))
    await vi.waitFor(() => expect(onLate).toHaveBeenCalledWith('late'))
  })

  test('isolates waits for different request signals', async () => {
    const firstController = new AbortController()
    const secondController = new AbortController()
    const firstReason = new Error('first request canceled')
    const firstAddEventListener = vi.spyOn(
      firstController.signal,
      'addEventListener',
    )
    const secondAddEventListener = vi.spyOn(
      secondController.signal,
      'addEventListener',
    )
    let resolveFirst!: (value: string) => void
    let resolveSecond!: (value: string) => void
    const first = new Promise<string>((resolve) => {
      resolveFirst = resolve
    })
    const second = new Promise<string>((resolve) => {
      resolveSecond = resolve
    })
    const firstResult = waitForRequest(first, firstController.signal)
    const secondResult = waitForRequest(second, secondController.signal)

    expect(firstAddEventListener).toHaveBeenCalledOnce()
    expect(secondAddEventListener).toHaveBeenCalledOnce()

    firstController.abort(firstReason)
    await expect(firstResult).rejects.toBe(firstReason)

    resolveSecond('second result')
    await expect(secondResult).resolves.toBe('second result')
    resolveFirst('late first result')
    await Promise.resolve()
  })

  test('observes fulfilled and rejected values when already aborted', async () => {
    const controller = new AbortController()
    const reason = new Error('request canceled')
    const lateError = new Error('late failure')
    const onLate = vi.fn()
    controller.abort(reason)

    await expect(
      waitForRequest(Promise.resolve('late'), controller.signal, onLate),
    ).rejects.toBe(reason)
    await expect(
      waitForRequest(Promise.reject(lateError), controller.signal),
    ).rejects.toBe(reason)

    await vi.waitFor(() => expect(onLate).toHaveBeenCalledWith('late'))
  })

  test('handles an abort during listener registration', async () => {
    const controller = new AbortController()
    const reason = new Error('request canceled')
    const onLate = vi.fn()
    const addEventListener = controller.signal.addEventListener.bind(
      controller.signal,
    )
    vi.spyOn(controller.signal, 'addEventListener').mockImplementation(
      (type, listener, options) => {
        addEventListener(type, listener, options)
        controller.abort(reason)
      },
    )
    let resolve!: (value: string) => void
    const value = new Promise<string>((resolveValue) => {
      resolve = resolveValue
    })

    const result = waitForRequest(value, controller.signal, onLate)
    await expect(result).rejects.toBe(reason)

    resolve('late')
    await vi.waitFor(() => expect(onLate).toHaveBeenCalledWith('late'))
  })
})
