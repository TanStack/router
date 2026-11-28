/**
 * The server-fn reach gate (`rsc-reach-app.ts`) on Rsbuild production
 * builds with RSC and the persistent cache (`performance.buildCache`):
 * `rsbuild build`, then a real edit of every server fn and `rsbuild build`
 * again (restored from the first build's cache, the edited modules
 * compiled again), the second build served; every button clicked answers
 * 200 and shows its server fn's edited value (SPEC J4.2).
 * Source: RSC investigation (Astra, 11-19: the public counter fails in a
 * cold build and answers from a warm cache, on head and main).
 */
import { expect } from 'vitest'
import { clickOutcome } from './client-only-reach-app'
import { openRscRsbuildPreviewServer } from './rsc-app'
import {
  answer,
  counterTest,
  editedReach,
  reachFiles,
  reachPositions,
} from './rsc-reach-app'
import { test } from './test'
import type { RscPreviewServer } from './rsc-app'

let server: RscPreviewServer
test.aroundAll(async (runSuite, { fileRoot }) => {
  server = await openRscRsbuildPreviewServer(
    {
      performance: { buildCache: true },
      files: reachFiles,
      buildAgainWith: editedReach(),
    },
    fileRoot,
  )
  try {
    await runSuite()
  } finally {
    await server.close()
  }
}, 120_000)

// SPEC J4.2: a server fn only client-only code imports is callable by id
// (the server compilation's last settlement run builds the resolver again
// once the client compiled, from what it calls; db260cf3a3 and 0a261a0259
// answered "Server function info not found").
test.for(reachPositions)(
  'a warm build after an edit: a server fn only $position of a $where imports answers with the edited value',
  async ({ name }, { page }) => {
    expect(await clickOutcome(page, server, name)).toEqual(answer(name, true))
  },
)

// SPEC J4.2 (#7943).
test(`a warm build after an edit: ${counterTest} with the edited value`, async ({
  page,
}) => {
  expect(await clickOutcome(page, server, 'counter')).toEqual(
    answer('counter', true),
  )
})
