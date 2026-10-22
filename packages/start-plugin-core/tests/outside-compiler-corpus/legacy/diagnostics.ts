/**
 * What the Start compiler reports, checked through the shared diagnostic
 * oracle (`@tanstack/compiler-test-utils/diagnostics`; SPEC G5, §5.7;
 * ruling 2026-10-22): the line a compile error points at in the user's
 * module, never its wording or code-frame layout; and the checks that a
 * misplaced server fn is supported, or rejected that way, and kept off the
 * client. Re-exported by `regression-helpers.ts`.
 */
import { expect } from 'vitest'
import { getModuleErrors } from '@tanstack/compiler-test-utils/validate-module'
import {
  diagnosticPosition,
  diagnosticsOf,
  expectDiagnostic,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { expectNotLoaded } from '@tanstack/compiler-test-utils/importers'
import {
  Thrown,
  callReportedServerFns,
  callerRpcId,
  compileFor,
  evaluateModule,
  moduleLoads,
  outputs,
} from './regression-helpers'
import type { ServerFn } from '../../../src/start-compiler/types'
import type { Output } from './regression-helpers'

/**
 * Asserts that `error` is a compile error about the user's module `source`
 * (SPEC G5) that, unless `at` is `undefined`, points at the line of `at`
 * (the first occurrence of that text in `source`, or a 1-based line), and
 * its column with `column`. The file name is the bundler's to add (the
 * compiler is called here without one).
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
  if (expected.at !== undefined) {
    const { line, column } =
      typeof expected.at === 'number'
        ? { line: expected.at, column: undefined }
        : diagnosticPosition(expected.source, expected.at)
    expectDiagnostic(error, {
      position: expected.column ? { line, column } : { line },
    })
  }
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

/** The handler body the misplacement fixtures give their server fn. */
const misplacedHandlerBody = 'db.inner()'

/** What compiling a module for one output gave: its code, or an error. */
export type OutputResult =
  | { code: string | null; serverFns: Record<string, ServerFn> }
  | { error: unknown }

/**
 * A misplaced `createServerFn` (one not assigned to a top-level variable;
 * its handler reads `db.inner()` of `serverOnlyModule`) is supported or
 * rejected, never shipped to the client (SPEC J4.6, J4.12). Each output,
 * on its own, either rejects the code with a compile error pointing at the
 * misplaced call (`expectCompileError`), or is a valid module: the client neither loads the server-only
 * module nor contains the handler body, the SSR caller may keep the
 * handler in place or call it through the provider, and the provider runs
 * every server fn the callers that compiled report, the misplaced one
 * included; with `read` (where an evaluated module holds the server fn),
 * the client's server fn calls the server by an id whose reported handler
 * runs the misplaced handler. One output rejecting the code does not
 * excuse another.
 *
 * `rejection: 'unpositioned'` is the loosened form of the regressions
 * paired with a goal pin: any compile error, at no particular position
 * (main's rejections of these placements carry no position; pinned in
 * known-bugs-start-compiler.test.ts).
 */
export async function expectOutputsFreeOfHandler(
  code: string,
  results: Record<Output, OutputResult>,
  options: MisplacementOptions = {},
) {
  const compiled: Partial<Record<Output, string>> = {}
  let serverFns: Record<string, ServerFn> = {}
  for (const output of outputs) {
    const result = results[output]
    if ('error' in result) {
      expectCompileError(result.error, {
        source: code,
        at:
          options.rejection === 'unpositioned'
            ? undefined
            : misplacedHandlerBody,
      })
      continue
    }
    compiled[output] = result.code ?? code
    if (output !== 'provider') {
      serverFns = { ...serverFns, ...result.serverFns }
    }
  }
  if (compiled.client !== undefined) {
    expectNotLoaded(await moduleLoads(compiled.client), [serverOnlyModule])
    expect(compiled.client, 'client').not.toContain(misplacedHandlerBody)
  }
  const errors: Partial<Record<Output, Array<string>>> = {}
  for (const [output, module] of Object.entries(compiled)) {
    errors[output as Output] = await getModuleErrors(module)
  }
  expect(errors).toEqual(
    Object.fromEntries(Object.keys(compiled).map((output) => [output, []])),
  )
  const stubs = {
    [serverOnlyModule]: { db: { inner: () => 'inner', top: () => 'top' } },
  }
  if (
    compiled.provider !== undefined &&
    (compiled.client !== undefined || compiled.ssr !== undefined)
  ) {
    const called = await callReportedServerFns(
      { ssr: compiled.ssr, provider: compiled.provider },
      serverFns,
      stubs,
    )
    expect(called).toContain('inner')
  }
  if (options.read && compiled.client !== undefined) {
    const id = callerRpcId(
      options.read(await evaluateModule(compiled.client, stubs)),
    )
    expect(id, 'the client server fn calls an RPC').toEqual(expect.any(String))
    expect(serverFns, 'the RPC id is reported').toHaveProperty(id!)
    expect(compiled.provider, 'a provider serves the RPC').toBeDefined()
    const [result] = await callReportedServerFns(
      { ssr: compiled.ssr, provider: compiled.provider! },
      { [id!]: serverFns[id!]! },
      stubs,
    )
    expect(result, 'the handler the RPC reaches').toBe('inner')
  }
}

export interface MisplacementOptions {
  /** What a rejection must report (default: the position). */
  rejection?: 'positioned' | 'unpositioned'
  /** The misplaced server fn in an evaluated module. */
  read?: (module: Record<string, any>) => unknown
}

/**
 * Compiles every output of `code`, each on its own (an output may reject the
 * code), and checks `expectOutputsFreeOfHandler`.
 */
export async function expectNoClientHandler(
  code: string,
  options: MisplacementOptions = {},
) {
  const results = {} as Record<Output, OutputResult>
  for (const output of outputs) {
    results[output] = await compileFor(output, code).catch(
      (error: unknown) => ({ error }),
    )
  }
  await expectOutputsFreeOfHandler(code, results, options)
}

/**
 * What `settle` gives for a `createServerOnlyFn` called outside the server,
 * or a `createClientOnlyFn` called outside the client (J4.10): the call
 * threw (ruling 2026-10-22: the error's wording is not checked). An
 * asymmetric matcher: compare with `toEqual`.
 */
export const throwsError = expect.toSatisfy(
  (value: unknown) => value instanceof Thrown,
  'a call that throws',
)
