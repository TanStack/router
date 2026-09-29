import { afterEach, beforeEach, bench, describe } from 'vitest'
import { setup } from './setup'

for (const reactiveCount of [200, 100]) {
  describe(`client-link-reactivity ${reactiveCount} reactive`, () => {
    const test = setup(reactiveCount)
    // Vitest uses Tinybench stage hooks; CodSpeed uses suite iteration hooks.
    // Both keep mounting, correctness assertions and cleanup outside timing.
    beforeEach(test.before)
    afterEach(test.after)
    bench(
      `client Links: ref updates ${reactiveCount} reactive ${200 - reactiveCount} static (vue)`,
      async () => {
        for (let tick = 0; tick < 8; tick++) {
          await test.tick()
        }
      },
      {
        warmupIterations: 100,
        warmupTime: 1000,
        time: 5000,
        throws: true,
        setup: test.before,
        teardown: test.after,
      },
    )
  })
}
