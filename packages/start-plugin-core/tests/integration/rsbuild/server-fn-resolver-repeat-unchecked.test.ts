/**
 * An Rsbuild app with RSC whose server function resolver cannot settle
 * (`resolver-repeat-app.ts`: a loader gives a server fn's file a plain
 * function on its provider's load), with the compiler's self-checks off,
 * as in users' builds: a production build fails and a dev server warns
 * (the next edit starts a new closure), each naming the provider of the
 * function that differs, also when another file's server fn has its name;
 * a build once (its closure runs at two stages of `finishMake`).
 * The switch is read once, when the compiler loads: this file runs in a
 * process of its own (project `integration-alone`) and turns it off before
 * anything loads.
 * Source: the RSC phase 1 re-check 4 (/var/tmp/rsc-p1-recheck4/report.md §3,
 * `resolver-duplicate.py`: 012645978b named "none" and failed the dev
 * compile too), re-check 7 (finding 4, `resolver-repeat.py`: 86b46c235e
 * reported it twice, in rounds 3 and 4), DECISIONS 2026-11-20 (an
 * unsettled closure: builds fail, dev servers warn).
 */
import { describe, expect, test, vi } from 'vitest'
import {
  expectDiagnostic,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { buildStart } from '../../build-start'
import { rejection } from '../../importProtection/start-apps'
import { rsbuildRscLinks } from '../../start-plugins'
import { rscAppFiles, startRsbuildRscApp } from '../rsc-warning-app'
import {
  resolverRepeatFiles,
  resolverRepeatRspack,
} from './resolver-repeat-app'

vi.hoisted(() => {
  process.env.TSR_COMPILER_VERIFY = '0'
})

const timeout = 60_000

describe('Rsbuild with RSC, a server function resolver that goes back to an earlier content, self-checks off', () => {
  test(
    "a production build fails, naming the differing function's provider",
    async () => {
      const failed = await rejection(
        buildStart({
          bundler: 'rsbuild',
          files: {
            ...rscAppFiles,
            ...resolverRepeatFiles,
            'src/entry.ts': `export {}\n`,
            'tsconfig.json': JSON.stringify({
              compilerOptions: { jsx: 'react-jsx' },
            }),
          },
          entry: 'src/entry.ts',
          symlinks: rsbuildRscLinks(),
          rsbuildConfig: { tools: { rspack: resolverRepeatRspack } } as never,
          start: { rsc: { enabled: true } } as never,
        }),
      )
      // (each diagnostic of the build: the error carries them all)
      expectDiagnostic(failed.diagnostics, {
        severity: 'error',
        file: 'src/fn1.ts',
        times: 1,
        root: failed.root,
      })
    },
    timeout,
  )

  test(
    "a dev server warns, naming the differing function's provider, and its compile does not fail",
    async () => {
      const server = await startRsbuildRscApp(resolverRepeatFiles, {
        tools: { rspack: resolverRepeatRspack },
      })
      await fetch(new URL('/', server.url))
      expectDiagnostic(server.diagnostics, {
        severity: 'warning',
        file: 'src/fn1.ts',
        root: server.root,
      })
      expect(
        findDiagnostics(server.diagnostics, { severity: 'error' }).map(
          ({ text }) => text,
        ),
      ).toEqual([])
    },
    timeout,
  )
})
