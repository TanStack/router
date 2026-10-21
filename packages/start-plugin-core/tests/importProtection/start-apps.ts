/**
 * Helpers of the import-protection tests that run Start's import protection
 * on a real app.
 *
 * `startProtectedDevServer` is a Vite dev server with Start's whole public
 * Vite plugin (`startDevServer`: `tanStackStartVite` of the built package),
 * configured through Start's public options only: `importProtection`, and
 * the app's router entry (`router.entry`, default `src/entry.ts` for these
 * fixtures), the module every client module of a Start app is reached from.
 * The start entry `src/start.ts` is Start's default.
 *
 * The violations a run reports are read two ways: structured, as
 * `onViolation` receives them (`server.violations`), and as the text the
 * user sees, on every channel, through the reader of `violation-report.ts`
 * (`reportedViolations`, `violationTexts`, `violationReports`).
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import react from '@vitejs/plugin-react'
import { expect, onTestFinished } from 'vitest'
import { createDevServer } from '@tanstack/compiler-test-utils/dev-server'
import {
  expectRelevantLocation,
  findDiagnostics,
  parseLocation,
} from '@tanstack/compiler-test-utils/diagnostics'
import {
  workspacePackage,
  workspacePackageLinks,
} from '@tanstack/compiler-test-utils/workspace-packages'
import { startDevServer } from '../dev-server'
import type { DevServer } from '@tanstack/compiler-test-utils/dev-server'
import type { Diagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import type { ImportProtectionOptions, ViolationInfo } from './public-types'
import type { StartDevServerOptions } from '../dev-server'
import type { PluginOption } from 'vite'

export {
  expectReportFrame,
  expectViolationsAt,
  locatedImporters,
  relevantViolations,
  reportedViolations,
  violationLabel,
  violationReports,
  violationTexts,
} from './violation-report'
export type {
  AppSources,
  ExpectedViolation,
  ReportedViolation,
} from './violation-report'
export type { ImportProtectionOptions, ViolationInfo } from './public-types'

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
   * Every violation `onViolation` received, in order (the app's own
   * `onViolation`, when it has one, still decides).
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
  const violations: Array<ViolationInfo> = []
  const userOnViolation = importProtection.onViolation
  const recording: ImportProtectionOptions = {
    ...importProtection,
    onViolation: (info) => {
      violations.push(info as ViolationInfo)
      return userOnViolation?.(info)
    },
  }
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
      importProtection: recording,
      router: { entry: path.posix.relative('src', router) },
    },
    // A React app's plugin: full-bundle dev needs its Refresh runtime.
    plugins: bundledDev ? [react(), ...plugins] : plugins,
  })
  return Object.assign(server, { violations })
}

/**
 * The file a package's `package.json` exports for `subpath` (its `import`
 * condition), as Node resolves an app's import of it.
 */
function exportedFile(root: string, subpath: string): string {
  const manifest = JSON.parse(
    readFileSync(path.join(root, 'package.json'), 'utf8'),
  ) as {
    exports: Record<string, string | { import?: unknown; default?: unknown }>
  }
  const entry = manifest.exports[subpath]!
  const target =
    typeof entry === 'string'
      ? entry
      : typeof entry.import === 'string'
        ? entry.import
        : ((entry.import as { default?: string } | undefined)?.default ??
          (entry.default as string))
  return path.join(root, target)
}

/**
 * Starts a Vite dev server on a React Start app with RSC enabled, the way
 * its `vite.config.ts` configures it: `tanstackStart({ rsc: { enabled:
 * true }, importProtection, router })` of the built
 * `@tanstack/react-start/plugin/vite`, Vite's RSC plugin
 * (`@vitejs/plugin-rsc`, as `@tanstack/react-start-rsc` installs it) and
 * `@vitejs/plugin-react`. Its server fn provider environment is `rsc`, a
 * third environment beside `client` and `ssr`. `@tanstack/react-start`,
 * `@tanstack/react-start-rsc` and `@vitejs/plugin-rsc` are linked into the
 * app (it imports them, as an installed app does).
 */
export async function startRscProtectedDevServer(
  files: Record<string, string>,
  importProtection: ImportProtectionOptions = {},
  options: { router?: string } = {},
): Promise<DevServer> {
  const { router = 'src/entry.ts' } = options
  const reactStart = workspacePackage('@tanstack/react-start')
  const reactStartRsc = workspacePackage('@tanstack/react-start-rsc')
  const rscPluginRoot = path.dirname(
    createRequire(path.join(reactStartRsc, 'package.json')).resolve(
      '@vitejs/plugin-rsc/package.json',
    ),
  )
  const { tanstackStart } = (await import(
    pathToFileURL(exportedFile(reactStart, './plugin/vite')).href
  )) as { tanstackStart: (options?: Record<string, unknown>) => PluginOption }
  const { default: rsc } = (await import(
    pathToFileURL(exportedFile(rscPluginRoot, '.')).href
  )) as { default: () => PluginOption }
  return createDevServer({
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
      'node_modules/@vitejs/plugin-rsc': rscPluginRoot,
    },
    config: { appType: 'custom' },
    plugins: [
      tanstackStart({
        rsc: { enabled: true },
        importProtection,
        router: { entry: path.posix.relative('src', router) },
      }),
      rsc(),
      react(),
    ],
  })
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
 * Checks the report of a marker violation (a module marked server-only
 * imported by the client, or client-only imported by the server): it names
 * both the marked module and its importer, and reports the violation either
 * at the marker import (`marker`, `file:line` of the marked module's import
 * of the marker; any column of it, or the file without a location), at
 * the importer's use of the import (`use`, `file:line:column`) or at any
 * line of the importer's import of the marked module (in its original
 * `source`). Each location is fine (coordinator ruling on audit F ASK-1;
 * SPEC J6.5, V1R ip I01).
 */
export function expectMarkerViolation(
  report: { importer: string; specifier: string; text: string },
  locations: { marker: string; use: string; source: string },
) {
  const marker = parseLocation(locations.marker)
  const use = parseLocation(locations.use)
  expectRelevantLocation(report.importer, {
    file: use.file,
    source: locations.source,
    uses: [{ line: use.line!, column: use.column }],
    imports: [report.specifier],
    others: [{ file: marker.file, lines: [marker.line!], unlocated: true }],
  })
  for (const file of [marker.file, use.file]) {
    expect(report.text).toContain(file)
  }
}

/**
 * What a dev server reported, on any channel (`server.diagnostics`: the
 * console, the process streams, Vite's logger), as a warning or an error
 * naming one of `files` (relative to the app root, or absolute), from
 * `since` (a `server.diagnostics.length` mark) on: for checks that nothing
 * is reported about a module, whatever the report's wording or layout
 * (SPEC §5.7, J6.12), next to the report reader's check.
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

/**
 * What a failed dev load reported: the rejection and everything the server
 * reported on any channel since `since` (a `server.diagnostics.length`
 * mark). A compiler may print the report on the console and reject with a
 * short error (SPEC §5.7); the report reader reads both.
 */
export function failureOutput(
  error: Error,
  server: Pick<DevServer, 'diagnostics' | 'root'>,
  since: number,
) {
  return {
    root: server.root,
    diagnostics: [
      { text: error.message },
      ...server.diagnostics
        .slice(since)
        .filter(({ severity }) => severity !== 'info'),
    ],
  }
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

/** The error a promise rejects with (fails when it resolves). */
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
    violations.map((info) => {
      const file = path.relative(root, info.importer).split(path.sep).join('/')
      const location = info.importerLoc
        ? `:${info.importerLoc.line}:${info.importerLoc.column}`
        : ''
      return `${info.envType} ${file}${location}`
    }),
  )
}
