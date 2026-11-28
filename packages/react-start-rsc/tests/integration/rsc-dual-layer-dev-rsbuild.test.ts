/**
 * Rsbuild dev with RSC: a `'use client'` component the route and a server
 * component both render (`rsc-dual-layer-app.ts`: one file, a module of the
 * SSR layer and one of the RSC layer of the server compiler: the `ssr` and
 * the `rsc` compile environments), exempt
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
import { describe } from 'vitest'
import {
  dualLayerBase,
  dualLayerStart,
  expectRealLabels,
  ucRoute,
  ucServer,
} from './rsc-dual-layer-app'
import { test } from './test'
import type { RsbuildDevServer } from '@tanstack/compiler-test-utils/rsbuild-dev-server'

const timeout = 60_000

async function page(server: RsbuildDevServer) {
  const response = await fetch(new URL('/uc', server.url))
  return { status: response.status, body: await response.text() }
}

// SPEC J6.7: an exempt importer gets the real module, in each compile
// environment, after every rebuild (KNOWN-BUGS, fixed: "Rsbuild dev with
// RSC: an exempt importer's denied import was denied after a rebuild"; the
// RSC layer's compile of `ClientBox.tsx`, a client reference there with no
// imports, replaced the SSR layer's row of import protection's edge index).
test(
  "Rsbuild dev with RSC: an exempt client component in both layers, through a route added while the server was stopped, its server component's use removed and restored, then the same after a fresh start",
  async ({ startRscRsbuildDevServer }) => {
    let server = await startRscRsbuildDevServer({
      browser: true,
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
    expectRealLabels(
      await page(server),
      2,
      server.diagnostics,
      'a route added while the server was stopped shows both real labels once the generator rebuilt the tree',
    )
    const edit = async (withUse: boolean, checkpoint: string) => {
      const since = server.diagnostics.length
      await server.edit({ 'src/utils/ucServer.tsx': ucServer(withUse) })
      expectRealLabels(
        await page(server),
        withUse ? 2 : 1,
        server.diagnostics.slice(since),
        checkpoint,
      )
    }
    await edit(
      false,
      "then removing the server component's use keeps the route's real label",
    )
    await edit(
      true,
      "then restoring the server component's use shows both real labels",
    )
    server = await server.restart()
    expectRealLabels(
      await page(server),
      2,
      server.diagnostics,
      'a fresh start on the final source shows both real labels',
    )
    await edit(
      false,
      "after the fresh start, removing the server component's use keeps the route's real label",
    )
    await edit(
      true,
      "after the fresh start, restoring the server component's use shows both real labels",
    )
  },
  3 * timeout,
)

// SPEC J6.6, J6.7: `allowImport` answers for an import in each environment
// (both layers' modules of the importer make it, `ssr` and `rsc`): a
// positive answer by importer gives the real module in both, through the
// same dev-first start (model audit row 27; Astra 11-19: passes).
describe('Rsbuild dev with RSC: allowImport for a client component in both layers', () => {
  test(
    'a route added while the server was stopped shows both real labels once the generator rebuilt the tree',
    async ({ startRscRsbuildDevServer }) => {
      let server = await startRscRsbuildDevServer({
        browser: true,
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
