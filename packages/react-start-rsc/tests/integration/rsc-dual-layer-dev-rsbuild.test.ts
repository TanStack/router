/**
 * Rsbuild dev with RSC: a `'use client'` component the route and a server
 * component both render (`rsc-dual-layer-app.ts`: one file, a module of the
 * SSR layer and one of the RSC layer of the `ssr` environment), exempt
 * from import protection, so its `.client.ts` import is real in both (SPEC
 * J6.7). Dev first: a route added while the server was stopped (a pull:
 * the first compile reads a tree without it, then the generator writes the
 * tree and the SSR compile runs again), then one consumer removed and
 * restored; then a fresh start on the final source
 * (the control: the tree is up to date when the first compile runs), and
 * the same removal and restoration from there. Each step reads the
 * document (both spans and their labels) and the errors reported since the
 * edit: a page answering 200 is not the outcome.
 * Source: RSC investigation (Astra, 11-19, L1; rsc-investigation-model.md
 * §5.1: the edge index of import protection is keyed by importer only).
 */
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterAll, describe, test } from 'vitest'
import { startRscRsbuildDevServer } from './rsc-app'
import {
  dualLayerBase,
  dualLayerStart,
  expectRealLabels,
  ucRoute,
  ucServer,
} from './rsc-dual-layer-app'
import type { RsbuildDevServer } from '@tanstack/compiler-test-utils/rsbuild-dev-server'

const timeout = 60_000

async function page(server: RsbuildDevServer) {
  const response = await fetch(new URL('/uc', server.url))
  return { status: response.status, body: await response.text() }
}

// Known bug (KNOWN-BUGS, "Rsbuild dev with RSC: an exempt importer's denied
// import is denied after a rebuild"). SPEC J6.7: an exempt importer gets the
// real module. Bug: import protection's edge index is keyed by importer id,
// not by layer: the RSC layer's compile of `ClientBox.tsx` (a client
// reference there, no imports) replaces the row of the SSR layer's compile,
// so when the SSR compile runs again nothing demands `browser.client.ts`
// from an exempt importer and the file is denied as its own violation.
// Impact: the SSR compile fails, the document answers 200 without the
// component, and later edits leave it broken; a fresh start passes.
// Fix: the exempt import is real after every rebuild (one row per layer).
describe('Rsbuild dev with RSC: an exempt client component in both layers', () => {
  let server: RsbuildDevServer
  let since = 0
  afterAll(async () => {
    // (none when the start failed)
    await (server as RsbuildDevServer | undefined)?.close()
  })

  test.fails(
    'a route added while the server was stopped shows both real labels once the generator rebuilt the tree',
    async () => {
      server = await startRscRsbuildDevServer({
        browser: true,
        // (the server lives across this file's tests)
        registerCleanup: () => {},
        start: dualLayerStart,
        files: dualLayerBase,
      })
      // A pull adds the route: the tree on disk does not list it when the
      // next server's first compile runs
      await server.stop()
      for (const [file, content] of Object.entries(ucRoute)) {
        await writeFile(path.join(server.root, file), content)
      }
      server = await server.restart()
      // (the generator writes the tree, and the SSR compile runs again)
      await server.settle()
      expectRealLabels(await page(server), 2, server.diagnostics)
    },
    timeout,
  )

  test.fails(
    "then removing the server component's use keeps the route's real label",
    async () => {
      since = server.diagnostics.length
      await server.edit({ 'src/utils/ucServer.tsx': ucServer(false) })
      expectRealLabels(await page(server), 1, server.diagnostics.slice(since))
    },
    timeout,
  )

  test.fails(
    "then restoring the server component's use shows both real labels",
    async () => {
      since = server.diagnostics.length
      await server.edit({ 'src/utils/ucServer.tsx': ucServer(true) })
      expectRealLabels(await page(server), 2, server.diagnostics.slice(since))
    },
    timeout,
  )

  test(
    'a fresh start on the final source shows both real labels',
    async () => {
      server = await server.restart()
      expectRealLabels(await page(server), 2, server.diagnostics)
    },
    timeout,
  )

  test.fails(
    "after the fresh start, removing the server component's use keeps the route's real label",
    async () => {
      since = server.diagnostics.length
      await server.edit({ 'src/utils/ucServer.tsx': ucServer(false) })
      expectRealLabels(await page(server), 1, server.diagnostics.slice(since))
    },
    timeout,
  )

  test.fails(
    "after the fresh start, restoring the server component's use shows both real labels",
    async () => {
      since = server.diagnostics.length
      await server.edit({ 'src/utils/ucServer.tsx': ucServer(true) })
      expectRealLabels(await page(server), 2, server.diagnostics.slice(since))
    },
    timeout,
  )
})

// SPEC J6.6, J6.7: `allowImport` answers for an import, which both layers'
// modules of the importer make: a positive answer by importer gives the
// real module in both, through the same dev-first start (model audit row
// 27: one answer per import; Astra 11-19: passes).
describe('Rsbuild dev with RSC: allowImport for a client component in both layers', () => {
  let server: RsbuildDevServer
  afterAll(async () => {
    // (none when the start failed)
    await (server as RsbuildDevServer | undefined)?.close()
  })

  test(
    'a route added while the server was stopped shows both real labels once the generator rebuilt the tree',
    async () => {
      server = await startRscRsbuildDevServer({
        browser: true,
        registerCleanup: () => {},
        start: {
          importProtection: {
            behavior: 'error',
            allowImport: (info: { importer: string }) =>
              info.importer.endsWith('/ClientBox.tsx'),
          },
        },
        files: dualLayerBase,
      })
      await server.stop()
      for (const [file, content] of Object.entries(ucRoute)) {
        await writeFile(path.join(server.root, file), content)
      }
      server = await server.restart()
      await server.settle()
      expectRealLabels(await page(server), 2, server.diagnostics)
    },
    timeout,
  )
})
