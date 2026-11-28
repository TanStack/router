/**
 * An Rsbuild dev server of an RSC app whose shared files are two modules
 * each, one per layer of the server compiler (`rsc-layers-app.ts`): every
 * state the RSC investigation's model audit lists as keyed by environment
 * name, id or path holds both modules apart, so each layer's module serves
 * its own role (SPEC J4.1, J4.2: the SSR layer's caller and the RSC layer's
 * provider of one server fn module; SPEC J4.17: the component and the
 * client reference of one `'use client'` file), and an edit of the file
 * reaches both (the plan cache, its path index and dependents, the stale
 * sets: SPEC G10).
 * Source: RSC investigation (rsc-investigation-model.md §4.1, 11-19: the
 * layer reaches the core only through a config digest; no test compiled
 * one file in both layers).
 */
import { beforeAll, describe, test } from 'vitest'
import { closeAfterAll } from '../../file-end'
import { startRsbuildRscAppShared } from '../rsc-warning-app'
import {
  clientBox,
  expectBothLayers,
  layersFiles,
  sharedFns,
} from './rsc-layers-app'
import type { RsbuildDevServer } from '@tanstack/compiler-test-utils/rsbuild-dev-server'

describe('Rsbuild dev with RSC: one file, a module in each layer', () => {
  let server: RsbuildDevServer
  const openServer = closeAfterAll()
  beforeAll(async () => {
    server = await openServer(() => startRsbuildRscAppShared(layersFiles))
  }, 60_000)

  test('a server fn module and a client component of both layers serve each layer its role', async () => {
    await expectBothLayers(server.url!, 'MARK_SHARED', 'box')
  })

  test('an edit of the server fn module reaches both layers', async () => {
    await server.edit({ 'src/shared/fns.ts': sharedFns('MARK_EDITED') })
    await expectBothLayers(server.url!, 'MARK_EDITED', 'box')
  })

  test('an edit of the client component reaches both layers', async () => {
    await server.edit({ 'src/shared/ClientBox.tsx': clientBox('edited') })
    await expectBothLayers(server.url!, 'MARK_EDITED', 'edited')
  })
})
