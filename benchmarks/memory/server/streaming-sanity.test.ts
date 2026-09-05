import { expect, it, vi } from 'vitest'
import { createWorkloadGroup } from './scenarios/streaming-peak/shared'

function response(chunks: number) {
  return new Response(
    new ReadableStream({
      start(controller) {
        for (let index = 0; index < chunks; index++) {
          controller.enqueue(
            new TextEncoder().encode('streaming-peak-fallback-0'),
          )
        }
        controller.close()
      },
    }),
  )
}

it('checks streaming after the route has loaded', async () => {
  const fetch = vi
    .fn()
    .mockImplementationOnce(() => response(1))
    .mockImplementationOnce(() => response(2))
  await createWorkloadGroup('solid', { fetch }).sanity()
  expect(fetch).toHaveBeenCalledTimes(2)
})

it('still rejects a buffered response after warmup', async () => {
  const fetch = () => response(1)
  await expect(
    createWorkloadGroup('solid', { fetch }).sanity(),
  ).rejects.toThrow(
    'Expected chunked sanity response to produce multiple chunks',
  )
})
