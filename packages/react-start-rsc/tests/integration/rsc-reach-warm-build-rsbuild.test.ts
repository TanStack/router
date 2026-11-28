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
import { expect } from 'vitest'
import { clickOutcome } from './client-only-reach-app'
import { openRscRsbuildPreviewServer } from './rsc-app'
import {
  answer,
  counterTest,
  reachFiles,
  reachPositions,
} from './rsc-reach-app'
import { test } from './test'
import type { RscPreviewServer } from './rsc-app'

const timeout = 120_000

let server: RscPreviewServer
test.aroundAll(async (runSuite, { fileRoot }) => {
  server = await openRscRsbuildPreviewServer(
    {
      performance: { buildCache: true },
      files: reachFiles,
      buildAgainWith: {},
    },
    fileRoot,
  )
  try {
    await runSuite()
  } finally {
    await server.close()
  }
}, timeout)

// SPEC J4.2: a server fn only client-only code imports is callable by id
// (the server compilation's last settlement run builds the resolver again
// once the client compiled, from what it calls; db260cf3a3 and 0a261a0259
// answered "Server function info not found").
test.for(reachPositions)(
  'a warm build: a server fn only $position of a $where imports answers',
  async ({ name }, { page }) => {
    expect(await clickOutcome(page, server, name)).toEqual(answer(name))
  },
)

// SPEC J4.2 (#7943).
test(`a warm build: ${counterTest}`, async ({ page }) => {
  expect(await clickOutcome(page, server, 'counter')).toEqual(answer('counter'))
})
