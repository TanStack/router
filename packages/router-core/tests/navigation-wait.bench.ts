import { bench, describe, expect } from 'vitest'
import { waitFor } from '../src/load-client'

const signal = new AbortController().signal
for (const mode of ['value', 'promise', 'rejection'] as const) {
  const input =
    mode === 'value'
      ? 42
      : mode === 'promise'
        ? Promise.resolve(42)
        : Promise.reject(42)
  // Consume the rejected input before registering timed cases.
  if (mode === 'rejection') {
    await expect(waitFor(input, signal)).rejects.toBe(42)
  } else {
    await expect(waitFor(input, signal)).resolves.toBe(42)
  }
  describe(`${mode} waits`, () => {
    bench(
      '80 waits on one signal',
      async () => {
        for (let index = 0; index < 80; index++) {
          if (mode === 'rejection') {
            try {
              await waitFor(input, signal)
            } catch {
              // A rejected value still exercises listener cleanup.
            }
          } else {
            await waitFor(input, signal)
          }
        }
      },
      { time: 1500, warmupTime: 300 },
    )
  })
}
