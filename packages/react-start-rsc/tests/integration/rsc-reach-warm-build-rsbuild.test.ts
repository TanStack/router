/**
 * The server-fn reach gate (`rsc-reach-app.ts`) on Rsbuild production
 * builds with RSC and the persistent cache (`performance.buildCache`):
 * `rsbuild build` run twice on the same source (the second restores from
 * the first's cache), the second build served; every button clicked
 * answers 200 and shows its server fn's value (SPEC J4.2). The fresh build
 * of the same graphs is rsc-start-rsbuild-build.test.ts.
 * Source: RSC investigation (Astra, 11-19: the public counter fails in a
 * cold build and answers from a warm cache, on head and main).
 */
import { afterAll, beforeAll, test } from 'vitest'
import { startRscRsbuildPreviewServer } from './rsc-app'
import {
  clickEveryButton,
  counterTest,
  expectAnswer,
  reachFiles,
  reachPositions,
} from './rsc-reach-app'
import type { ClickOutcome } from './rsc-reach-app'

const timeout = 120_000

let outcomes: Record<string, ClickOutcome | Error>
const cleanups: Array<() => Promise<void>> = []
beforeAll(async () => {
  const server = await startRscRsbuildPreviewServer({
    registerCleanup: (cleanup) => {
      cleanups.push(cleanup)
    },
    performance: { buildCache: true },
    files: reachFiles,
    buildAgainWith: {},
  })
  outcomes = await clickEveryButton(server)
}, timeout)
afterAll(async () => {
  for (const cleanup of cleanups.reverse()) {
    await cleanup()
  }
})

// SPEC J4.2: a server fn only client-only code imports is callable by id
// (the server compilation's last settlement run builds the resolver again
// once the client compiled, from what it calls; db260cf3a3 and 0a261a0259
// answered "Server function info not found").
test.for(reachPositions)(
  'a warm build: a server fn only $position of a $where imports answers',
  ({ name }) => {
    expectAnswer(outcomes, name)
  },
)

// SPEC J4.2 (#7943).
test(`a warm build: ${counterTest}`, () => {
  expectAnswer(outcomes, 'counter')
})
