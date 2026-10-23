/**
 * What the Start compiler reports, checked through the shared diagnostic
 * oracle (`@tanstack/compiler-test-utils/diagnostics`; SPEC G5, §5.7;
 * ruling 2026-10-22): a compile error is reported, at the line (and column)
 * of the user's module it is about; never its wording, code frame or
 * channel. And the check that a misplaced server fn is supported, or
 * rejected that way, and kept off the client, through the public Start
 * host (`./start-host`). Re-exported by `regression-helpers.ts`.
 */
import { expect } from 'vitest'
import {
  diagnosticPosition,
  diagnosticsOf,
  expectDiagnostic,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { expectNotLoaded } from '@tanstack/compiler-test-utils/importers'
import {
  CompileFailure,
  Thrown,
  callFromClient,
  callOnServer,
  compileError,
} from './regression-helpers'
import type { StartHost } from './start-host'

/**
 * Asserts that `error` is a compile error about the user's module `source`
 * (SPEC G5) that names the module's file (a `CompileFailure` of
 * `compileError` knows it) and, unless `at` is `undefined`, reports the
 * line of `at` (the first occurrence of that text in `source`, or a
 * 1-based line), and its column with `column`, after naming the file: the
 * error the environment threw or one the app reported meanwhile on any
 * channel (a `CompileFailure` carries both).
 */
export function expectCompileError(
  error: unknown,
  expected: {
    source: string
    at: string | number | undefined
    /** Also require the column of `at` (a string). */
    column?: boolean
  },
) {
  expect(error, 'a compile error').toBeInstanceOf(Error)
  const candidates =
    error instanceof CompileFailure
      ? [...diagnosticsOf(error.error), ...error.reported]
      : diagnosticsOf(error)
  const position =
    expected.at === undefined
      ? undefined
      : typeof expected.at === 'number'
        ? { line: expected.at }
        : expected.column
          ? diagnosticPosition(expected.source, expected.at)
          : { line: diagnosticPosition(expected.source, expected.at).line }
  expectDiagnostic(candidates, {
    ...(error instanceof CompileFailure && { file: error.file }),
    ...(position && { position }),
  })
}

/**
 * Asserts that `error` (a build error, any shape `diagnosticsOf` reads)
 * reports one of `sites`: a diagnostic names the site's file and the line
 * of `at` in its `source`. For a mistake the fix may report at either end
 * (a library or its caller).
 */
export function expectSourceError(
  error: unknown,
  expected: { sites: Array<{ file: string; source: string; at: string }> },
) {
  const diagnostics = diagnosticsOf(error)
  const reported = expected.sites.some(
    (site) =>
      findDiagnostics(diagnostics, {
        file: site.file,
        position: { line: diagnosticPosition(site.source, site.at).line },
      }).length > 0,
  )
  expect(
    reported,
    `a diagnostic at ${expected.sites.map((site) => `${site.file} (${site.at})`).join(' or ')}:\n${diagnostics.map((diagnostic) => diagnostic.text).join('\n---\n')}`,
  ).toBe(true)
}

/** Server-only module the server fns of the misplacement tests read. */
export const serverOnlyModule = './db.server'

/** The real server-only module of the misplacement fixtures. */
const serverOnlyFile = `export const db = { inner: () => 'inner', top: () => 'top' }\n`

/** The handler body the misplacement fixtures give their server fn. */
const misplacedHandlerBody = 'db.inner()'

export interface MisplacementOptions {
  /** What a rejection must report (default: the position). */
  rejection?: 'positioned' | 'unpositioned'
  /**
   * The misplaced server fn: a JavaScript expression with the module as
   * `module` (e.g. `module.make()`), read in the page and on the server.
   */
  read?: string
  /** Other case files, by path relative to the case directory. */
  files?: Record<string, string>
}

/**
 * A misplaced `createServerFn` (one not assigned to a top-level variable;
 * its handler reads `db.inner()` of `serverOnlyModule`, a real module of
 * the case) is supported or rejected, never shipped to the client (SPEC
 * J4.6, J4.12). Each environment, on its own, either rejects the module
 * with a compile error pointing at the misplaced call's line
 * (`expectCompileError`), or serves a working module: the client page imports it without loading
 * the server-only module or receiving the handler body, and the SSR
 * environment evaluates it; with `read` (where the module holds the server
 * fn), calling it from the client reaches the handler through the server
 * (`callFromClient`) and calling it from server code runs it
 * (`callOnServer`), both giving what the misplaced handler returns. One
 * environment rejecting the code does not excuse another.
 *
 * `rejection: 'unpositioned'` is the loosened form of the regressions
 * paired with a goal pin: any compile error, at no particular position.
 */
export async function expectNoClientHandler(
  host: StartHost,
  code: string,
  options: MisplacementOptions = {},
) {
  const startCase = await host.case({
    'db.server.ts': serverOnlyFile,
    ...options.files,
    'module.tsx': code,
  })
  const served: Partial<Record<'client' | 'ssr', string>> = {}
  for (const environment of ['client', 'ssr'] as const) {
    const failure = await compileError(startCase, environment)
    if (failure) {
      expectCompileError(failure, {
        source: code,
        at:
          options.rejection === 'unpositioned'
            ? undefined
            : misplacedHandlerBody,
      })
    } else {
      served[environment] = await startCase.served('module.tsx', environment)
    }
  }
  if (served.client !== undefined) {
    expectNotLoaded(await startCase.loads(), [serverOnlyModule])
    expect(served.client, 'client').not.toContain(misplacedHandlerBody)
    const run = await startCase.client('return true')
    expect(run.errors, 'client page errors').toEqual([])
  }
  if (served.ssr !== undefined) {
    await startCase.ssr()
  }
  if (options.read !== undefined) {
    if (served.client !== undefined) {
      expect(
        await callFromClient(startCase, options.read),
        'the handler a client call reaches',
      ).toBe('inner')
    }
    if (served.ssr !== undefined) {
      expect(
        await callOnServer(startCase, options.read),
        'the handler a server call runs',
      ).toBe('inner')
    }
  }
}

/**
 * What `settle` gives for a `createServerOnlyFn` called outside the server,
 * or a `createClientOnlyFn` called outside the client (J4.10): it is a
 * function (`settle` gives back what is no function), and calling it threw
 * (ruling 2026-10-22: the error's wording is not checked). An asymmetric
 * matcher: compare with `toEqual`.
 */
export const throwsError = expect.toSatisfy(
  (value: unknown) => value instanceof Thrown,
  'a call that throws',
)
