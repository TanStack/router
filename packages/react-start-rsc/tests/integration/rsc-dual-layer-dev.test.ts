/**
 * Vite dev with RSC: the twin of rsc-dual-layer-dev-rsbuild.test.ts. A
 * `'use client'` component the route and a server component both render
 * (`rsc-dual-layer-app.ts`: on Vite a module of the `ssr` environment and
 * one of the `rsc` environment), exempt from import protection, so its
 * `.client.ts` import is real in both (SPEC J6.7). Dev first: a route added
 * while the server runs (the generator writes the route tree), then one
 * consumer removed and restored; then a fresh start on the final source.
 * Each step reads the document (both spans and their labels) and the
 * errors reported since the edit.
 * Source: RSC investigation (Astra, 11-19, L1 on Rsbuild; Vite passes).
 */
import { describe } from 'vitest'
import {
  dualLayerBase,
  dualLayerStart,
  expectRealLabels,
  ucRoute,
  ucServer,
  ucServerWithLabel,
} from './rsc-dual-layer-app'
import { test } from './test'

const timeout = 60_000

test(
  "Vite dev with RSC: an exempt client component in the ssr and rsc environments, through a route added, its server component's use removed and restored, then a fresh start",
  async ({ startRscDevServer }) => {
    const start = (files: Record<string, string>) =>
      startRscDevServer({ listen: true, start: dualLayerStart, files })
    let server = await start(dualLayerBase)
    const edit = async (
      files: Record<string, string>,
      count: number,
      checkpoint: string,
    ) => {
      const since = server.diagnostics.length
      await server.edit(files)
      expectRealLabels(
        await server.fetch('/uc'),
        count,
        server.diagnostics.slice(since),
        checkpoint,
      )
    }
    await edit(
      ucRoute,
      2,
      'a route added while the server runs shows both real labels',
    )
    await edit(
      { 'src/utils/ucServer.tsx': ucServer(false) },
      1,
      "then removing the server component's use keeps the route's real label",
    )
    await edit(
      { 'src/utils/ucServer.tsx': ucServer(true) },
      2,
      "then restoring the server component's use shows both real labels",
    )
    server = await start({ ...dualLayerBase, ...ucRoute })
    expectRealLabels(
      await server.fetch('/uc'),
      2,
      server.diagnostics,
      'a fresh start on the final source shows both real labels',
    )
  },
  2 * timeout,
)

// SPEC J6.6, J6.7: Vite names the environments `allowImport` answers for:
// a positive answer for `rsc` and `ssr` gives the real module to the server
// component's own import (the `rsc` environment) and to the client
// component SSR renders, from both the route and the server component
// (model audit row 33: allowed targets keyed by environment type; Astra
// 11-19: passes).
describe('Vite dev with RSC: allowImport by environment name', () => {
  test(
    'the denied helper is real for the server component and for the client component in SSR',
    async ({ startRscDevServer }) => {
      const server = await startRscDevServer({
        listen: true,
        start: {
          importProtection: {
            behavior: 'error',
            allowImport: (info: { env: string }) =>
              info.env === 'rsc' || info.env === 'ssr',
          },
        },
        files: {
          ...dualLayerBase,
          ...ucRoute,
          'src/utils/ucServer.tsx': ucServerWithLabel,
        },
      })
      expectRealLabels(await server.fetch('/uc'), 3, server.diagnostics)
    },
    timeout,
  )
})
