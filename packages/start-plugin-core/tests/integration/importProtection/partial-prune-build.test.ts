/**
 * A denied import the client keeps only part of, in real Start builds (Vite
 * and Rsbuild): it is judged like an import kept whole (SPEC J6.4). Mock
 * mode serves the mock in its place and reports each importer; error mode
 * fails the build, naming each importer. The cases: partial-prune-cases.ts.
 */
import { describe, expect, test } from 'vitest'
import { buildStart, startBundlers } from '../../build-harness'
import { describeValuePrelude } from '../../importProtection/mock-helpers'
import { rejection } from '../../importProtection/start-apps'
import {
  expectedImporters,
  mockedLeaks,
  partialPruneApp,
  partialPruneProtection,
  readLeaks,
  realMark,
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
      }).toEqual({
        ...mockedLeaks,
        realCode: 'nowhere',
        reported: expectedImporters,
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
})
