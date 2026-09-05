import { afterEach, expect, it, vi } from 'vitest'
import { runSequentialRequestLoop } from './bench-utils'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('drains each response before starting the next request', async () => {
  vi.useFakeTimers()
  const events: Array<string> = []
  let index = 0
  const run = runSequentialRequestLoop(
    {
      fetch() {
        const current = index++
        events.push(`fetch ${current}`)
        return new Response(
          new ReadableStream({
            start(controller) {
              setTimeout(() => {
                events.push(`body ${current}`)
                controller.enqueue(new Uint8Array([1]))
                controller.close()
              }, 0)
            },
          }),
        )
      },
    },
    {
      seed: 1,
      iterations: 2,
      buildRequest: () => new Request('http://localhost/'),
    },
  )
  await vi.runAllTimersAsync()
  await run
  expect(events).toEqual(['fetch 0', 'body 0', 'fetch 1', 'body 1'])
})

it('releases a failed response reader and does not start another request', async () => {
  const failure = new Error('stream failed')
  const body = new ReadableStream({
    start(controller) {
      controller.error(failure)
    },
  })
  const fetch = vi.fn(() => new Response(body))
  await expect(
    runSequentialRequestLoop(
      { fetch },
      {
        seed: 1,
        iterations: 2,
        buildRequest: () => new Request('http://localhost/'),
      },
    ),
  ).rejects.toBe(failure)
  expect(body.locked).toBe(false)
  expect(fetch).toHaveBeenCalledTimes(1)
})
