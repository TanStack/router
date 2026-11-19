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

// Known bug (KNOWN-BUGS, "RSC builds: a server fn only client-only code
// imports is not registered"; as `main`). SPEC J4.2: a server fn the client
// calls is callable by id. Bug: Rsbuild compiles no reach of the provider,
// and a build restored from the persistent cache does not either; nothing
// compiles these modules in the RSC layer before the provider's manifest
// is written. Impact: the click answers "Server function info not found".
// Fix: every server fn the client references is callable by id, with no
// production dependency on modules only development code reaches.
test.fails.for(reachPositions)(
  'a warm build: a server fn only $position of a $where imports answers',
  ({ name }) => {
    expectAnswer(outcomes, name)
  },
)

// SPEC J4.2 (KNOWN-BUGS, "Rsbuild RSC build: a server fn whose only importer
// is a 'use client' component is not registered": a cold build fails it).
test(`a warm build: ${counterTest}`, () => {
  expectAnswer(outcomes, 'counter')
})
