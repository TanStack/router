import { afterEach, expect, it, vi } from 'vitest'
import { makeDeferredRecords } from './scenarios/aborted-requests/deferred-records'

afterEach(() => {
  vi.useRealTimers()
})

it('keeps abort probes pending without timers until the request is cancelled', async () => {
  vi.useFakeTimers()
  const controller = new AbortController()
  const resolved = vi.fn()
  const records = makeDeferredRecords('abort-1', 'alpha', controller.signal)
  void records.then(resolved)
  await vi.runAllTimersAsync()
  expect(resolved).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
  controller.abort()
  await expect(records).resolves.toEqual([])
})

it('handles an already cancelled request without scheduling work', async () => {
  vi.useFakeTimers()
  await expect(
    makeDeferredRecords('abort-1', 'beta', AbortSignal.abort()),
  ).resolves.toEqual([])
  expect(vi.getTimerCount()).toBe(0)
})

it('cancels timers for an interrupted full response', async () => {
  vi.useFakeTimers()
  const controller = new AbortController()
  const records = makeDeferredRecords('sanity-full', 'alpha', controller.signal)
  controller.abort()
  await expect(records).resolves.toEqual([])
  expect(vi.getTimerCount()).toBe(0)
})

it('still produces full deferred payloads for an uninterrupted response', async () => {
  vi.useFakeTimers()
  const controller = new AbortController()
  const records = makeDeferredRecords('sanity-full', 'beta', controller.signal)
  await vi.runAllTimersAsync()
  await expect(records).resolves.toHaveLength(20)
  expect(vi.getTimerCount()).toBe(0)
})
