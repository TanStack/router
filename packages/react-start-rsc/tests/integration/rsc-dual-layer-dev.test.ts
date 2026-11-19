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
import { afterAll, describe, test } from 'vitest'
import { startRscDevServer } from './rsc-app'
import {
  dualLayerBase,
  dualLayerStart,
  expectRealLabels,
  ucRoute,
  ucServer,
  ucServerWithLabel,
} from './rsc-dual-layer-app'
import type { DevServer } from '@tanstack/compiler-test-utils/dev-server'

const timeout = 60_000

describe('Vite dev with RSC: an exempt client component in the ssr and rsc environments', () => {
  const servers: Array<DevServer> = []
  let since = 0
  afterAll(async () => {
    for (const server of servers) {
      await server.close()
    }
  })
  const start = async (files: Record<string, string>) => {
    const server = await startRscDevServer({
      listen: true,
      // (the server lives across this file's tests)
      registerCleanup: () => {},
      start: dualLayerStart,
      files,
    })
    servers.push(server)
    return server
  }
  const server = () => servers.at(-1)!

  test(
    'a route added while the server runs shows both real labels',
    async () => {
      await start(dualLayerBase)
      since = server().diagnostics.length
      await server().edit(ucRoute)
      expectRealLabels(
        await server().fetch('/uc'),
        2,
        server().diagnostics.slice(since),
      )
    },
    timeout,
  )

  test(
    "then removing the server component's use keeps the route's real label",
    async () => {
      since = server().diagnostics.length
      await server().edit({ 'src/utils/ucServer.tsx': ucServer(false) })
      expectRealLabels(
        await server().fetch('/uc'),
        1,
        server().diagnostics.slice(since),
      )
    },
    timeout,
  )

  test(
    "then restoring the server component's use shows both real labels",
    async () => {
      since = server().diagnostics.length
      await server().edit({ 'src/utils/ucServer.tsx': ucServer(true) })
      expectRealLabels(
        await server().fetch('/uc'),
        2,
        server().diagnostics.slice(since),
      )
    },
    timeout,
  )

  test(
    'a fresh start on the final source shows both real labels',
    async () => {
      await start({ ...dualLayerBase, ...ucRoute })
      expectRealLabels(await server().fetch('/uc'), 2, server().diagnostics)
    },
    timeout,
  )
})

// SPEC J6.6, J6.7: Vite names the environments `allowImport` answers for:
// a positive answer for `rsc` and `ssr` gives the real module to the server
// component's own import (the `rsc` environment) and to the client
// component SSR renders, from both the route and the server component
// (model audit row 33: allowed targets keyed by environment type; Astra
// 11-19: passes).
describe('Vite dev with RSC: allowImport by environment name', () => {
  test(
    'the denied helper is real for the server component and for the client component in SSR',
    async () => {
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
