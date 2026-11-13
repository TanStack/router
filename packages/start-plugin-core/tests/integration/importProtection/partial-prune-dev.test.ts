/**
 * A denied import the client keeps only part of, on Start's Vite and
 * Rsbuild dev servers (client code in a browser page): it is judged like an
 * import kept whole (SPEC J6.4). Mock mode serves the mock in its place
 * and reports each importer; error mode reports each importer and the
 * client gets none of the real modules. The cases: partial-prune-cases.ts
 * (the page loads the split chunk too: a dev server compiles it when
 * requested).
 */
import { captureConsole } from '@tanstack/compiler-test-utils/diagnostics'
import { describe, expect, test } from 'vitest'
import { describeValuePrelude } from '../../importProtection/mock-helpers'
import { violationRecorder } from '../../importProtection/start-apps'
import {
  runInClient,
  runViteClient,
  startBrowserRsbuildStartDevServer,
  startBrowserStartDevServer,
} from './client-pages'
import {
  expectedImporters,
  loadSplitChunk,
  mockedLeaks,
  partialPruneApp,
  partialPruneProtection,
  readLeaks,
} from './partial-prune-cases'
import { importersIn } from './v2-hosts'

const timeout = 60_000
const compileTimeout = timeout

/** What the client run of `script` gave on `host` with `behavior`, and the importers reported. */
async function devRun(
  host: 'vite' | 'rsbuild',
  behavior: 'mock' | 'error',
  script: string,
) {
  const recorder = violationRecorder({ ...partialPruneProtection, behavior })
  const start = { importProtection: recorder.importProtection }
  if (host === 'vite') {
    const server = await startBrowserStartDevServer({
      files: partialPruneApp,
      start,
    })
    const run = await runViteClient(server, '/src/entry.ts', script).then(
      ({ result }) => ({ result }),
      (error: unknown) => ({ error: String(error) }),
    )
    await server.idle()
    return {
      run,
      reported: importersIn({ root: server.root, ...recorder }, 'client'),
    }
  }
  const server = await startBrowserRsbuildStartDevServer({
    compileTimeout,
    files: partialPruneApp,
    start,
  })
  const { result: run } = await captureConsole(() =>
    runInClient(server, script).catch((error: unknown) => ({
      error: String(error),
    })),
  )
  return {
    run,
    reported: importersIn({ root: server.root, ...recorder }, 'client'),
  }
}

describe.each(['vite', 'rsbuild'] as const)('%s dev', (host) => {
  test(
    'mock mode: each partly kept import gets the mock, and its importer is reported',
    async () => {
      expect(
        await devRun(
          host,
          'mock',
          `${describeValuePrelude}${loadSplitChunk}${readLeaks}`,
        ),
      ).toEqual({ run: { result: mockedLeaks }, reported: expectedImporters })
    },
    timeout,
  )

  // the client fails to load an importer of a denied import; Vite compiles
  // the split chunk only when the page requests it, which a page whose route
  // tree failed to load never does (Rsbuild compiles the whole graph)
  test(
    'error mode: the client fails, and the importer of each partly kept import is reported',
    async () => {
      const { run, reported } = await devRun(host, 'error', 'return null')
      expect({ failed: 'error' in run, reported }).toEqual({
        failed: true,
        reported:
          host === 'vite'
            ? expectedImporters.filter((file) => !file.includes('split-chunk'))
            : expectedImporters,
      })
    },
    timeout,
  )
})
