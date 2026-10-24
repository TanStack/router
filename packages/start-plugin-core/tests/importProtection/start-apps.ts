/**
 * Helpers of the import-protection tests that run Start's import protection
 * on a real app.
 *
 * `startProtectedDevServer` is a Vite dev server with Start's whole public
 * Vite plugin (`startDevServer`: `tanstackStart()` of the built framework
 * package), configured through Start's public options only:
 * `importProtection`, and
 * the app's router entry (`router.entry`, default `src/entry.ts` for these
 * fixtures), the module every client module of a Start app is reached from.
 * The start entry `src/start.ts` is Start's default.
 *
 * The violations a run reports are read as Start's public `onViolation`
 * callback receives them (`server.violations`, `build.violations`; SPEC
 * J6.5, J6.6), never parsed from the printed report. That each is printed
 * (a warning or an error the user sees) is checked by `expectViolationsAt`
 * and `expectPrinted`, only for the file and position it names (ruling
 * 2026-10-22).
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { expect, onTestFinished } from 'vitest'
import { createDevServer } from '@tanstack/compiler-test-utils/dev-server'
import {
  expectDiagnostic,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { workspacePackageLinks } from '@tanstack/compiler-test-utils/workspace-packages'
import { startDevServer } from '../dev-server'
import {
  rscDependency,
  rscPluginFactory,
  startPluginFactory,
} from '../start-plugins'
import type { DevServer } from '@tanstack/compiler-test-utils/dev-server'
import type { Diagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import type { ImportProtectionOptions, ViolationInfo } from './public-types'
import type { StartDevServerOptions } from '../dev-server'
import type { StartBuild, StartBuildError } from '../build-harness'
import type { PluginOption } from 'vite'

export type { ImportProtectionOptions, ViolationInfo } from './public-types'

/**
 * What recorded the violations of a run: a dev server, a build or a failed
 * build (`violations`: what `onViolation` received; `root`: the app root).
 */
export interface Recorded {
  violations: Array<ViolationInfo>
  root: string
  /** What the run printed, on every channel (a dev server's or a build's). */
  diagnostics?: Array<Diagnostic>
}

/** A violation `onViolation` received, with paths relative to the app root. */
export interface Violation {
  environment: 'client' | 'server'
  /** The importer, with `:line:column` when the violation has a location. */
  importer: string
  specifier: string
  resolved?: string
  /**
   * The import chain, from an entry to the importer (`file[:line:column]`),
   * whichever direction `onViolation` listed it in (`traceFromEntry`).
   */
  trace: Array<{ at: string; imports?: string }>
}

/** `file` relative to `root` when it is an absolute path under it. */
function relative(root: string, file: string) {
  const name = path.relative(root, file)
  return !path.isAbsolute(file) || name.startsWith('..')
    ? file
    : name.split(path.sep).join('/')
}

/** `file:line:column`, or the file alone without a line. */
const located = (root: string, file: string, line?: number, column?: number) =>
  `${relative(root, file)}${line === undefined ? '' : `:${line}${column === undefined ? '' : `:${column}`}`}`

/**
 * An `onViolation` for Start's public `importProtection` option that records
 * every violation Start reports (`violations`), and `importProtection` with
 * it. The app's own `onViolation` (of `importProtection`) still decides: a
 * violation it allows (`false`) is not reported, so not recorded.
 */
export function violationRecorder(
  importProtection: ImportProtectionOptions = {},
) {
  const violations: Array<ViolationInfo> = []
  const own = importProtection.onViolation
  const onViolation = async (info: unknown) => {
    const verdict = await own?.(info)
    if (verdict !== false) {
      violations.push(info as ViolationInfo)
    }
    return verdict
  }
  return {
    violations,
    onViolation,
    importProtection: { ...importProtection, onViolation },
  }
}

/**
 * The steps of `info.trace` from the entry to the importer. A trace may be
 * listed entry first or entry last (SPEC J6.5, ruling "restructured
 * compilers", R10): one whose first step is the importer, and whose last
 * step is not, is listed entry last.
 */
export function traceFromEntry(info: ViolationInfo): ViolationInfo['trace'] {
  const isImporter = (step: ViolationInfo['trace'][number] | undefined) =>
    step !== undefined &&
    step.file.split('?')[0] === info.importer.split('?')[0]
  return isImporter(info.trace[0]) && !isImporter(info.trace.at(-1))
    ? [...info.trace].reverse()
    : info.trace
}

/**
 * The violations of `recorded`, in order (each trace from the entry to the
 * importer, `traceFromEntry`).
 */
export function violationsOf(recorded: Recorded): Array<Violation> {
  return recorded.violations.map((info) => ({
    environment: info.envType,
    // (the file of the location when it names one: an original source)
    importer: located(
      recorded.root,
      info.importerLoc?.file ?? info.importer,
      info.importerLoc?.line,
      info.importerLoc?.column,
    ),
    specifier: info.specifier,
    ...(info.resolved !== undefined && {
      resolved: relative(recorded.root, info.resolved),
    }),
    trace: traceFromEntry(info).map((step) => ({
      at: located(recorded.root, step.file, step.line, step.column),
      ...(step.specifier !== undefined && { imports: step.specifier }),
    })),
  }))
}

/** `environment` and `importer` of each violation of `recorded`, in order. */
export function reportedViolations(
  recorded: Recorded,
): Array<{ environment: string; importer: string }> {
  return violationsOf(recorded).map(({ environment, importer }) => ({
    environment,
    importer,
  }))
}

/** `recorded` with only the violations of the environment type `environment`. */
export function inEnvironment(
  recorded: Recorded,
  environment: 'client' | 'server',
): Recorded {
  return {
    root: recorded.root,
    violations: recorded.violations.filter(
      (info) => info.envType === environment,
    ),
  }
}

/**
 * A violation a test expects: its environment type, the importer's use of
 * the denied import (`use`: `file:line:column`) and the other places it
 * may be reported at instead (SPEC J6.5, V1R ip I01: any line of the
 * import, another genuine use, a marker's origin), written out: `file:line`
 * (any column), `file:line:column`, or `file` (no location).
 */
export interface ExpectedViolation {
  environment: 'client' | 'server'
  use: string
  also?: Array<string>
}

/** `environment use`: how `expectViolationsAt` names an expected violation. */
export const violationLabel = (expected: ExpectedViolation) =>
  `${expected.environment} ${expected.use}`

/**
 * The file, line and column of a location (`file`, `file:line` or
 * `file:line:column`): only a trailing `:line` or `:line:column` is the
 * position, so a file named with a colon (Rspack's `webpack:/src/a.tsx`,
 * the F2 pin) keeps its whole name.
 */
export function locationParts(location: string): {
  file: string
  line?: string
  column?: string
} {
  const [, file, line, column] = /^(.*?)(?::(\d+))?(?::(\d+))?$/.exec(location)!
  return {
    file: file!,
    ...(line !== undefined && { line }),
    ...(column !== undefined && { column }),
  }
}

/**
 * The file of the app a location names: its file (`locationParts`) without
 * a URL scheme such as Rspack's `webpack:/` (how the report names the file
 * is pinned in reported-location.test.ts, "the reported importer is a file
 * of the app", F2).
 */
export const appFileOf = (location: string) =>
  locationParts(location).file.replace(/^[a-z]+:\/+/, '')

/**
 * Whether `reported` (`file`, `file:line` or `file:line:column`) is the
 * place `accepted` names: the same file, line and column, as far as
 * `accepted` gives them, with no location for a bare file.
 */
export function isAt(reported: string, accepted: string) {
  const { file, line, column } = locationParts(accepted)
  const {
    file: reportedFile,
    line: reportedLine,
    column: reportedColumn,
  } = locationParts(reported)
  return (
    reportedFile === file &&
    (line === undefined
      ? reportedLine === undefined
      : reportedLine === line &&
        (column === undefined || reportedColumn === column))
  )
}

/**
 * Each distinct violation of `recorded` (environment type and importer),
 * named `violationLabel` of the expected violation it is at one of the
 * places of, else `environment importer` as received.
 */
export function relevantViolations(
  recorded: Recorded,
  expected: Array<ExpectedViolation>,
): Array<string> {
  return distinct(
    reportedViolations(recorded).map(({ environment, importer }) => {
      const match = expected.find(
        (violation) =>
          violation.environment === environment &&
          [violation.use, ...(violation.also ?? [])].some((place) =>
            isAt(importer, place),
          ),
      )
      return match ? violationLabel(match) : `${environment} ${importer}`
    }),
  )
}

/**
 * Asserts that the distinct violations of `recorded` are exactly the
 * `expected` ones, each at one of its places, in any order; and, when
 * `recorded` has what the run printed, that each is printed as a warning or
 * an error naming its importer and position (SPEC J6.3: every violation is
 * reported).
 */
export function expectViolationsAt(
  recorded: Recorded,
  expected: Array<ExpectedViolation>,
) {
  expect(relevantViolations(recorded, expected).sort()).toEqual(
    expected.map(violationLabel).sort(),
  )
  if (recorded.diagnostics) {
    for (const violation of violationsOf(recorded)) {
      expectPrinted(recorded.diagnostics, recorded.root, violation, [
        'warning',
        'error',
      ])
    }
  }
}

/**
 * `environment file` of each violation of `recorded` (the importer's file,
 * without its location), in order: which importers are reported. Where
 * they are is checked by `expectViolationsAt`.
 */
export function reportedImporters(recorded: Recorded): Array<string> {
  return reportedViolations(recorded).map(
    ({ environment, importer }) =>
      `${environment} ${locationParts(importer).file}`,
  )
}

export interface ProtectedDevServerOptions {
  /** Serve actual dependencies and an HTTP origin for client consumers. */
  browser?: boolean
  /**
   * The app's router entry (relative to the app root, in `src`): Start's
   * public `router.entry` option, the module every client module of a Start
   * app is reached from. Default `src/entry.ts`.
   */
  router?: string
  /** Other plugins of the app, after Start's. */
  plugins?: Array<PluginOption>
  /** Vite configuration of the app (e.g. `server.warmup`). */
  config?: StartDevServerOptions['config']
  /**
   * Vite's full-bundle dev (`experimental.bundledDev`): Rolldown bundles the
   * client from Start's own client entry (the bundle input Start's plugin
   * configures), which imports the app's client entry: `src/client.ts`
   * when the app has one, else one that imports `entry` (as a real client
   * entry reaches the router entry through `StartClient`).
   * `server.clientBundle()` gives the bundle.
   */
  bundledDev?: StartDevServerOptions['bundledDev']
}

export interface ProtectedDevServer extends DevServer {
  /**
   * Every violation Start reported through `onViolation`, in order (the
   * app's own `onViolation`, when it has one, still decides: one it allows
   * is not listed).
   */
  violations: Array<ViolationInfo>
}

/**
 * Starts a Vite dev server with Start's plugin (`startDevServer`) on an app
 * of `files`, with Start's `importProtection` option `importProtection`
 * (source directory `src`) and the app's router entry `options.router`.
 */
export async function startProtectedDevServer(
  files: Record<string, string>,
  importProtection: ImportProtectionOptions = {},
  options: ProtectedDevServerOptions = {},
): Promise<ProtectedDevServer> {
  const {
    router = 'src/entry.ts',
    plugins = [],
    config = {},
    bundledDev,
  } = options
  const recorder = violationRecorder(importProtection)
  const hasClientEntry = Object.keys(files).some((file) =>
    /^src\/client\.[cm]?[jt]sx?$/.test(file),
  )
  const server = await startDevServer({
    files: {
      ...(bundledDev &&
        !hasClientEntry && {
          'harness/client-entry.ts': `import ${JSON.stringify(
            `../${bundledDev.entry.replace(/\.[cm]?[jt]sx?$/, '')}`,
          )}\n`,
        }),
      ...files,
    },
    browser: options.browser,
    bundledDev,
    config,
    start: {
      importProtection: recorder.importProtection,
      router: { entry: path.posix.relative('src', router) },
    },
    // A React app's plugin: full-bundle dev needs its Refresh runtime.
    plugins: bundledDev ? [react(), ...plugins] : plugins,
  })
  return Object.assign(server, { violations: recorder.violations })
}

/**
 * Starts a Vite dev server on a React Start app with RSC enabled, the way
 * its `vite.config.ts` configures it: `tanstackStart({ rsc: { enabled:
 * true }, importProtection, router })` (Start's import protection with its
 * defaults, recorded; router entry `src/entry.ts`) of the built
 * `@tanstack/react-start/plugin/vite`, Vite's RSC plugin
 * (`@vitejs/plugin-rsc`, as `@tanstack/react-start-rsc` installs it) and
 * `@vitejs/plugin-react`. Its server fn provider environment is `rsc`, a
 * third environment beside `client` and `ssr`. `@tanstack/react-start`,
 * `@tanstack/react-start-rsc` and `@vitejs/plugin-rsc` are linked into the
 * app (it imports them, as an installed app does).
 */
export async function startRscProtectedDevServer(
  files: Record<string, string>,
): Promise<ProtectedDevServer> {
  const recorder = violationRecorder({})
  const tanstackStart = await startPluginFactory('react')
  const rsc = await rscPluginFactory()
  const server = await createDevServer({
    dir: path.dirname(path.dirname(fileURLToPath(import.meta.url))),
    prefix: '.start-rsc-dev-server-',
    registerCleanup: onTestFinished,
    files: {
      'src/router.tsx': `export const getRouter = () => undefined\n`,
      'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()
`,
      ...files,
    },
    symlinks: {
      ...workspacePackageLinks([
        '@tanstack/react-start',
        '@tanstack/react-start-rsc',
      ]),
      'node_modules/@vitejs/plugin-rsc': rscDependency('@vitejs/plugin-rsc'),
    },
    config: { appType: 'custom' },
    plugins: [
      tanstackStart({
        rsc: { enabled: true },
        importProtection: recorder.importProtection,
        router: { entry: 'entry.ts' },
      }),
      rsc(),
      react(),
    ],
  })
  return Object.assign(server, { violations: recorder.violations })
}

/**
 * An app whose server fn factory module `src/factory.ts` uses its denied
 * imports (the denied file `src/secret.server.ts` and the denied specifier
 * `@tanstack/react-start/server`) only inside `createMiddleware().server()`,
 * which the client never runs, and whose `src/leak.ts` uses the denied file
 * in a function the client may call; the router entry `src/entry.ts`
 * re-exports a server fn of the factory and the leak. `factoryTail` is
 * appended to the factory module (from line 9).
 */
export const serverFnFactoryApp = (factoryTail = '') => ({
  'src/secret.server.ts': `export const getSecret = () => 'MARK_SECRET'\n`,
  'src/factory.ts': `import { createMiddleware, createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { getSecret } from './secret.server'
const mw = createMiddleware({ type: 'function' }).server(({ next }) => {
  const req = getRequest()
  return next({ context: { req, secret: getSecret() } })
})
export const createSecretFn = createServerFn().middleware([mw])
${factoryTail}`,
  'src/usage.ts': `import { createSecretFn } from './factory'
export const fn = createSecretFn().handler(async ({ context }) => context)
`,
  'src/leak.ts': `import { getSecret } from './secret.server'
export const leak = () => getSecret()
`,
  'src/entry.ts': `export { fn } from './usage'
export { leak } from './leak'
`,
})

/**
 * A `factoryTail` of `serverFnFactoryApp` calling the denied
 * `getRequest()` at the top level of the factory module, which the client
 * runs (located at `src/factory.ts:9:24`).
 */
export const factoryTopLevelCall = `export const request = getRequest()\n`

/**
 * A client module re-exporting everything of a denied module (`src/b.ts`:
 * `export * from`, line 1) and a module importing one of its names
 * (`src/c.ts`, as `v`), with the import-protection options that deny it:
 * a denied file, and a package denied by a specifier rule. The denied
 * module's value carries `MARK_SECRET`. For the ruling Q4 rows (RULINGS
 * "Q4: `export *` of a denied module").
 */
export const starReexportApps: Array<{
  name: string
  files: Record<string, string>
  importProtection: ImportProtectionOptions
}> = [
  {
    name: 'a denied file',
    files: {
      'src/secret.server.ts': `export const getRequest = () => 'MARK_SECRET'\n`,
      'src/b.ts': `export * from './secret.server'\n`,
      'src/c.ts': `import { getRequest } from './b'\nexport const v = getRequest\n`,
    },
    importProtection: {},
  },
  {
    name: 'a denied specifier',
    files: {
      'node_modules/denied-sdk/package.json': JSON.stringify({
        name: 'denied-sdk',
        type: 'module',
        exports: './index.js',
      }),
      'node_modules/denied-sdk/index.js': `export const getRequest = () => 'MARK_SECRET'\n`,
      'src/b.ts': `export * from 'denied-sdk'\n`,
      'src/c.ts': `import { getRequest } from './b'\nexport const v = getRequest\n`,
    },
    importProtection: { client: { specifiers: ['denied-sdk'] } },
  },
]

/**
 * Checks a marker violation (a module marked server-only imported by the
 * client, or client-only imported by the server): it is reported either at
 * the marker import (`marker`, `file:line` of the marked module's import of the
 * marker; any column of it, or the file without a location), at the
 * importer's use of the import (`use`, `file:line:column`) or at a line of
 * the importer's import of the marked module (`imports`, `file:line`).
 * Each location is fine (coordinator ruling on audit F ASK-1; SPEC J6.5,
 * V1R ip I01).
 */
export function expectMarkerViolation(
  violation: Violation,
  locations: { marker: string; use: string; imports: Array<string> },
) {
  const markerFile = locationParts(locations.marker).file
  expect(
    [locations.use, ...locations.imports, locations.marker, markerFile].some(
      (place) => isAt(violation.importer, place),
    ),
    `${violation.importer} is at ${locations.use}, ${locations.imports.join(', ')} or ${locations.marker}`,
  ).toBe(true)
}

/**
 * Asserts that a `severity` diagnostic the user sees (`diagnostics`: every
 * channel) names the importer of `violation` and its position (SPEC §5.7:
 * file and position; ruling 2026-10-22).
 */
export function expectPrinted(
  diagnostics: Array<Diagnostic>,
  root: string,
  violation: { importer: string },
  severity: 'warning' | 'error' | Array<'warning' | 'error'>,
) {
  const { file, line, column } = locationParts(violation.importer)
  expectDiagnostic(diagnostics, {
    severity,
    file,
    root,
    ...(line !== undefined && {
      position: { line: Number(line), column: Number(column) },
    }),
  })
}

/**
 * What a dev server reported, on any channel (`server.diagnostics`: the
 * console, the process streams, Vite's logger), as a warning or an error
 * naming one of `files` (relative to the app root, or absolute), from
 * `since` (a `server.diagnostics.length` mark) on: for checks that nothing
 * is reported about a module, whatever the report's wording or layout
 * (SPEC §5.7, J6.12), next to the `onViolation` check.
 */
export function problemsNaming(
  server: Pick<DevServer, 'diagnostics' | 'root'>,
  files: Array<string>,
  since = 0,
): Array<string> {
  const reported = server.diagnostics
    .slice(since)
    .filter(({ severity }) => severity !== 'info') as Array<Diagnostic>
  return [
    ...new Set(
      files.flatMap((file) =>
        findDiagnostics(reported, { file, root: server.root }).map(
          ({ text }) => text,
        ),
      ),
    ),
  ]
}

/** Each distinct value of `values`, in order. */
export function distinct<T>(values: Array<T>): Array<T> {
  return [...new Set(values)]
}

/** `file:line:column` of the first `needle` on 1-based line `line` of `code`. */
export function locationIn(
  file: string,
  code: string,
  line: number,
  needle: string,
): string {
  const column = code.split('\n')[line - 1]!.indexOf(needle)
  if (column === -1) {
    throw new Error(`${needle} is not on line ${line}`)
  }
  return `${file}:${line}:${column + 1}`
}

/**
 * The error a promise rejects with (fails when it resolves): a build's
 * `StartBuildError`, with what the build reported.
 */
export async function rejection(
  promise: Promise<StartBuild>,
): Promise<StartBuildError>
export async function rejection(promise: Promise<unknown>): Promise<Error>
export async function rejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise
  } catch (error) {
    return error as Error
  }
  throw new Error('expected the promise to reject')
}

/**
 * The import-protection violations `onViolation` received, as
 * `<environment type> <importer>` relative to `root` (with `:line:column`
 * when located), each distinct value once, in order.
 */
export function receivedViolations(
  violations: Array<ViolationInfo>,
  root: string,
): Array<string> {
  return distinct(
    reportedViolations({ violations, root }).map(
      ({ environment, importer }) => `${environment} ${importer}`,
    ),
  )
}
