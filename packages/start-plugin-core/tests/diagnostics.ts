/**
 * What the Start compiler reports, checked through the shared diagnostic
 * oracle (`@tanstack/compiler-test-utils/diagnostics`; SPEC G5, §5.7): the
 * API a compile error names, the line (and column) it points at in the
 * user's module and that it explains its cause in its own words
 * (`explains`: content, not a word list), never its prose or code-frame
 * layout; and the check that a misplaced server fn is supported, or
 * rejected that way, and kept off the client, through the public Start host
 * (`./start-host`). Re-exported by `regression-helpers.ts`.
 */
import { expect } from 'vitest'
import {
  diagnosticPosition,
  diagnosticProse,
  diagnosticsOf,
  expectDiagnostic,
  identifiesEnvRestriction,
  mismatches,
} from '@tanstack/compiler-test-utils/diagnostics'
import { expectNotLoaded } from '@tanstack/compiler-test-utils/importers'
import {
  CompileFailure,
  Thrown,
  callFromClient,
  callOnServer,
  compileError,
} from './regression-helpers'
import type { Environment } from '@tanstack/compiler-test-utils/diagnostics'
import type { StartHost } from './start-host'

/**
 * The text of a diagnostic without what quotes `source` (code-frame lines,
 * whole, cropped or highlighted, in any tool's layout, caret markers, and
 * lines quoting the source whole or cropped): what is left is what the
 * diagnostic says itself, so an API name it must give is not found in the
 * quoted code (`diagnosticProse` of the shared oracle; V1R start N13).
 */
export function withoutQuotedSource(text: string, source: string) {
  return diagnosticProse(text, source)
}

/**
 * What a diagnostic about a server fn without its handler function
 * (`.handler()`) names and explains (SPEC G5, §5.7; V1R start N04): the
 * API the user called, `createServerFn` or its `handler` method, and an
 * explanation in its own words (`explains`): an engine crash reading a
 * property of `undefined` explains nothing.
 */
export const missingHandler = {
  names: [['createServerFn', 'handler']],
  explains: true as const,
}

/**
 * Asserts that `error` is a compile error about the user's module `source`
 * (SPEC G5): it names every API or binding of `names` (a list: any one of
 * its alternatives) in its own words (`withoutQuotedSource`), explains its
 * cause in its own words when `explains` is given (`true`, or the input
 * content it must mention), and, unless `at` is `undefined`, points at the
 * line of `at` (the first occurrence of that text in `source`, or a 1-based
 * line), and its column with `column`: all of it in one diagnostic, the
 * error the environment threw or one the app reported meanwhile on any
 * channel (a `CompileFailure` of `compileError` carries both). Prose,
 * code-frame layout, context length and the channel are free (§5.7).
 */
export function expectCompileError(
  error: unknown,
  expected: {
    source: string
    at: string | number | undefined
    names: Array<string | Array<string>>
    /** Also require the column of `at` (a string). */
    column?: boolean
    /** The error must explain its cause in its own words. */
    explains?: true | { mentions?: Array<string | Array<string>> }
  },
) {
  expect(error, 'a compile error').toBeInstanceOf(Error)
  // The error the environment threw and what the app reported meanwhile
  // on any channel (`compileError`): one of them must say it all.
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
    ...(position && { position }),
    names: expected.names,
    explains: expected.explains,
    prose: true,
    source: expected.source,
  })
}

/**
 * Asserts that `error` (a build error, any shape `diagnosticsOf` reads)
 * reports one of `sites`: a diagnostic names the site's file and the line
 * of `at` in its `source`, and names `names` (a list: any one of its
 * alternatives) in its own words. For a mistake the fix may report at
 * either end (a library or its caller).
 */
export function expectSourceError(
  error: unknown,
  expected: {
    names: Array<string | Array<string>>
    sites: Array<{ file: string; source: string; at: string }>
  },
) {
  const sources = expected.sites.map((site) => site.source).join('\n')
  const diagnostics = diagnosticsOf(error)
  const reported = expected.sites.some((site) =>
    diagnostics.some(
      (diagnostic) =>
        mismatches(diagnostic, {
          file: site.file,
          position: { line: diagnosticPosition(site.source, site.at).line },
          source: site.source,
        }).length === 0 &&
        mismatches(
          {
            ...diagnostic,
            text: withoutQuotedSource(diagnostic.text, sources),
          },
          { names: expected.names },
        ).length === 0,
    ),
  )
  expect(
    reported,
    `a diagnostic naming ${expected.names.join(', ')} at ${expected.sites.map((site) => `${site.file} (${site.at})`).join(' or ')}:\n${diagnostics.map((diagnostic) => diagnostic.text).join('\n---\n')}`,
  ).toBe(true)
}

/** Server-only module the server fns of the misplacement tests read. */
export const serverOnlyModule = './db.server'

/** The real server-only module of the misplacement fixtures. */
const serverOnlyFile = `export const db = { inner: () => 'inner', top: () => 'top' }\n`

/** The handler body the misplacement fixtures give their server fn. */
const misplacedHandlerBody = 'db.inner()'

export interface MisplacementOptions {
  /** What a rejection must carry (default: the API and the position). */
  rejection?: 'positioned' | 'named'
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
 * the case) is supported or rejected clearly, never shipped to the client
 * (SPEC J4.6, J4.12). Each environment, on its own, either rejects the
 * module with a compile error naming `createServerFn`, explaining its cause
 * in its own words and pointing at the misplaced call (`expectCompileError`;
 * an internal crash without that position or explanation does not count),
 * or serves a working module: the client page imports it without loading
 * the server-only module or receiving the handler body, and the SSR
 * environment evaluates it; with `read` (where the module holds the server
 * fn), calling it from the client reaches the handler through the server
 * (`callFromClient`) and calling it from server code runs it
 * (`callOnServer`), both giving what the misplaced handler returns. One
 * environment rejecting the code does not excuse another.
 *
 * `rejection: 'named'` is the loosened form of the regressions paired with
 * a goal pin: a rejection only has to name `createServerFn` and explain its
 * cause, at no particular position.
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
        at: options.rejection === 'named' ? undefined : misplacedHandlerBody,
        names: ['createServerFn'],
        explains: true,
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
 * What `settle` gives for a `createServerOnlyFn` called outside the server
 * (J4.10): it threw an error restricting the call to the server, whatever
 * its prose (`identifiesEnvRestriction`). An asymmetric matcher: compare
 * with `toEqual`.
 */
export const serverOnlyError = thrownEnvRestriction('server')
/** `serverOnlyError` for a `createClientOnlyFn` called outside the client. */
export const clientOnlyError = thrownEnvRestriction('client')

function thrownEnvRestriction(env: Environment) {
  return expect.toSatisfy(
    (value: unknown) =>
      value instanceof Thrown && identifiesEnvRestriction(value.error, env),
    `a call that throws an error restricting it to the ${env}`,
  )
}
