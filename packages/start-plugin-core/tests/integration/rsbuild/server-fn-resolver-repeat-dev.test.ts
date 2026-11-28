/**
 * An Rsbuild dev server with RSC whose server function resolver cannot
 * settle (`resolver-repeat-app.ts`: a loader gives a server fn's file a
 * plain function on its provider's load): in our test runs (the compiler's
 * self-checks on) the compile fails, and its error names the provider of
 * the function that differs, also when another file's server fn has its
 * name, once in the compilation (its closure runs at two stages of
 * `finishMake`). The severities users get:
 * `server-fn-resolver-repeat-unchecked.test.ts`.
 * Source: the RSC phase 1 re-check 4 (/var/tmp/rsc-p1-recheck4/report.md §3,
 * `resolver-duplicate.py`: 012645978b named "none"), re-check 7 (finding 4,
 * `resolver-repeat.py`: 86b46c235e reported it in rounds 3 and 4),
 * DECISIONS 2026-11-20 (an unsettled closure: our test runs throw).
 */
import { describe, test } from 'vitest'
import { expectDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import { startRsbuildRscApp } from '../rsc-warning-app'
import {
  resolverRepeatFiles,
  resolverRepeatRspack,
} from './resolver-repeat-app'

const timeout = 60_000

describe('Rsbuild dev with RSC, a server function resolver that goes back to an earlier content', () => {
  test(
    "the compile fails, naming the differing function's provider",
    async () => {
      const server = await startRsbuildRscApp(resolverRepeatFiles, {
        tools: { rspack: resolverRepeatRspack },
      })
      await fetch(new URL('/', server.url))
      expectDiagnostic(server.diagnostics, {
        severity: 'error',
        file: 'src/fn1.ts',
        times: 1,
        root: server.root,
      })
    },
    timeout,
  )
})
