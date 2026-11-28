import { test } from 'vitest'
import { startRscDevServer } from './rsc-app'
/**
 * The server-fn reach gate (`rsc-reach-app.ts`) on a Vite dev server with
 * RSC: every button clicked after a fresh start, after a restart (`vite
 * dev` restarting in place, as on a config edit) and after a real edit of
 * every server fn; each click answers 200 and shows its server fn's value
 * (SPEC J4.2: a server fn the client calls is callable by id).
 * Source: RSC investigation (Astra, 11-19: reach outcomes depend on the
 * host, the restart history and the persistent cache).
 */
import { expectReachHistory, reachFiles } from './rsc-reach-app'

test('Vite dev with RSC: every server fn the client calls answers after a fresh start, a restart and an edit of every server fn', async ({
  signal,
}) => {
  const server = await startRscDevServer({ browser: true, files: reachFiles })
  await expectReachHistory(signal, server, async () => {
    await server.vite.restart()
    return server
  })
}, 120_000)
