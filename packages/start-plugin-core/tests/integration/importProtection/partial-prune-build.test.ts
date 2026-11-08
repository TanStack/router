/**
 * A denied import the client keeps only part of, in real Start builds (Vite
 * and Rsbuild): it is judged like an import kept whole (SPEC J6.4). Mock
 * mode serves the mock in its place and reports each importer; error mode
 * fails the build, naming each importer. Alike on the server for a
 * client-only file. The cases: partial-prune-cases.ts.
 */
import { describe, expect, test } from 'vitest'
import { buildStart, startBundlers } from '../../build-harness'
import { describeValuePrelude } from '../../importProtection/mock-helpers'
import { rejection } from '../../importProtection/start-apps'
import {
  clientMark,
  expectedImporters,
  expectedServerImporters,
  mockedLeaks,
  partialPruneApp,
  partialPruneProtection,
  readLeaks,
  realMark,
  serverCaseApp,
} from './partial-prune-cases'
import { importersIn } from './v2-hosts'

const timeout = 90_000

describe.each(startBundlers)('%s build', (bundler) => {
  test(
    'mock mode: each partly kept import gets the mock, and its importer is reported',
    async () => {
      const built = await buildStart({
        bundler,
        files: partialPruneApp,
        entry: 'src/entry.ts',
        start: {
          importProtection: { ...partialPruneProtection, behavior: 'mock' },
        },
      })
      const { result } = await built.client.run(
        `${describeValuePrelude}${readLeaks}`,
      )
      expect({
        ...(result as object),
        realCode: built.client.where(realMark),
        reported: importersIn(built, 'client'),
        serverRealCode: built.ssr.where(clientMark),
        serverReported: importersIn(built, 'server'),
      }).toEqual({
        ...mockedLeaks,
        realCode: 'nowhere',
        reported: expectedImporters,
        serverRealCode: 'nowhere',
        serverReported: expectedServerImporters,
      })
    },
    timeout,
  )

  test(
    'error mode: the build fails, naming the importer of each partly kept import',
    async () => {
      const error = await rejection(
        buildStart({
          bundler,
          files: partialPruneApp,
          entry: 'src/entry.ts',
          start: {
            importProtection: { ...partialPruneProtection, behavior: 'error' },
          },
        }),
      )
      expect(importersIn(error, 'client')).toEqual(expectedImporters)
    },
    timeout,
  )

  test(
    'error mode: the build fails, naming the importer of a partly kept import on the server',
    async () => {
      const error = await rejection(
        buildStart({
          bundler,
          files: serverCaseApp,
          entry: 'src/entry.ts',
          start: {
            importProtection: { ...partialPruneProtection, behavior: 'error' },
          },
        }),
      )
      expect({
        client: importersIn(error, 'client'),
        server: importersIn(error, 'server'),
      }).toEqual({ client: [], server: expectedServerImporters })
    },
    timeout,
  )
})
