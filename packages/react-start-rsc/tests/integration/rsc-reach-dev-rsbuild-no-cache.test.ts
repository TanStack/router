import { test } from 'vitest'
import { startRscRsbuildDevServer } from './rsc-app'
/**
 * The server-fn reach gate (`rsc-reach-app.ts`) on an Rsbuild dev server
 * with RSC and no persistent cache (`performance.buildCache: false`; with
 * it: rsc-reach-dev-rsbuild.test.ts): every button clicked after a fresh
 * start, after a restart (`rsbuild dev` run again; the route tree is up to
 * date when its first compile runs) and after a real edit of every server
 * fn; each click answers 200 and shows its server fn's value (SPEC J4.2: a
 * server fn the client calls is callable by id).
 * Source: RSC investigation (Astra, 11-19: outcomes of the two graphs
 * depend on the start history and the persistent cache, in opposite ways).
 */
import { expectReachHistory, reachFiles } from './rsc-reach-app'

// SPEC J4.2: a server fn the client calls is callable by id, whatever the
// start history: a restart whose route tree is up to date answers too (the
// server compilation's last settlement run builds the resolver again once
// the client compiled, from what it calls; db260cf3a3 and 0a261a0259
// answered "Server function info not found").
test('Rsbuild dev with RSC, no cache: every server fn the client calls answers after a fresh start, a restart and an edit of every server fn', async ({
  signal,
}) => {
  const server = await startRscRsbuildDevServer({
    browser: true,
    config: { performance: { buildCache: false } },
    files: reachFiles,
  })
  await expectReachHistory(signal, server, () => server.restart())
}, 120_000)
