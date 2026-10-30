/**
 * Import protection through path aliases (SPEC J6.1, J6.5,
 * G11): a client module imports the denied file `src/secret.server.ts` as
 * `~/secret.server`, an alias of the app's `tsconfig.json` `paths`, and uses
 * it live. Rules match the file the alias resolves to, whichever resolver
 * resolves it: `vite-tsconfig-paths` before Start's plugin (the usual order
 * of a `vite.config.ts`) or after it, Vite's own `resolve.tsconfigPaths`, and
 * Rsbuild, which reads `paths` itself. Per resolver:
 * - a build (default `behavior`: error) fails, and its report names the
 *   specifier as written (`~/secret.server`) and the importer at an original
 *   line of the import or the use;
 * - dev (default `behavior`: mock) gives the importer a safe mock: no secret,
 *   no initializer of the denied file runs;
 * - dev with `behavior: { dev: 'error' }` reports the same violation.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tsconfigPaths from 'vite-tsconfig-paths'
import { createDevServer } from '@tanstack/compiler-test-utils/dev-server'
import {
  captureConsole,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { afterEach, describe, expect, onTestFinished, test } from 'vitest'
import { buildStart, startRuntimeLinks } from '../../build-harness'
import { startPlugin, startPluginFiles } from '../../dev-server'
import { probeMockPrelude, safeMock } from '../../importProtection/mock-helpers'
import {
  locationIn,
  rejection,
  violationRecorder,
  violationsOf,
} from '../../importProtection/start-apps'
import { originalLocation } from '../../importProtection/original-location'
import {
  clientFixturePlugin,
  runInClient,
  runViteClient,
  startBrowserRsbuildStartDevServer as startRsbuildStartDevServer,
} from './client-pages'
import type { ImportProtectionOptions } from '../../importProtection/public-types'
import type { Recorded } from '../../importProtection/start-apps'
import type { PluginOption } from 'vite'

const timeout = 60_000
const compileTimeout = timeout

/** The directory the apps stand in for (where their imports resolve). */
const testsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
)

afterEach(() => {
  delete (globalThis as Record<string, unknown>).secretLoaded
})

const widget = `import { secret } from '~/secret.server'
export const widget = () => secret()
`

/**
 * `src/components/widget.ts` uses the denied file through the alias `~/`
 * (`tsconfig.json` `paths`); the entry re-exports it, and gives it to the
 * page (`globalThis.widget`) for the Rsbuild dev runs. The denied file
 * records that it ran.
 */
const aliasApp = {
  'tsconfig.json': JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      jsx: 'react-jsx',
      paths: { '~/*': ['./src/*'] },
    },
    include: ['src'],
  }),
  'src/secret.server.ts': `;(globalThis as any).secretLoaded = 'MARK_SECRET_LOADED'
export const secret = () => 'MARK_SECRET'
`,
  'src/components/widget.ts': widget,
  'src/entry.ts': `import { widget } from './components/widget'
;(globalThis as any).widget = widget
export { widget }
`,
}

/**
 * The report of the violation: the specifier as the importer wrote it, and
 * the importer, located (if at all, SPEC §5 item 14) at the import (line 1,
 * any column) or at the use of `secret` (SPEC J6.5).
 */
const expectedReport = {
  environment: 'client',
  specifier: '~/secret.server',
  importer: originalLocation(
    locationIn('src/components/widget.ts', widget, 2, 'secret()'),
    1,
    { unavailable: true },
  ),
}

const reportsOf = (recorded: Recorded) =>
  violationsOf(recorded).map(({ environment, specifier, importer }) => ({
    environment,
    specifier,
    importer,
  }))

type ViteAlias =
  | 'vite-tsconfig-paths before Start'
  | 'vite-tsconfig-paths after Start'
  | 'resolve.tsconfigPaths'

/**
 * Each Vite resolver of the alias: the app's `vite.config.ts` (loaded
 * before the harness's inline plugins, as a user's config file is) or the
 * inline configuration of a build; the plugins of a dev server, in order.
 */
const viteAliases: Array<{
  alias: ViteAlias
  files: Record<string, string>
  viteConfig: object
  devPlugins: (start: PluginOption) => Array<PluginOption>
  devConfig: object
}> = [
  {
    alias: 'vite-tsconfig-paths before Start',
    files: {
      'vite.config.ts': `import tsconfigPaths from 'vite-tsconfig-paths'
export default { plugins: [tsconfigPaths()] }
`,
    },
    // `vite build` runs in the app directory: Vite loads the app's config
    // file, whose plugins come before the inline ones (Start's).
    viteConfig: { configFile: 'vite.config.ts' },
    devPlugins: (start) => [tsconfigPaths(), start],
    devConfig: {},
  },
  {
    alias: 'vite-tsconfig-paths after Start',
    files: {},
    viteConfig: { plugins: [tsconfigPaths()] },
    devPlugins: (start) => [start, tsconfigPaths()],
    devConfig: {},
  },
  {
    alias: 'resolve.tsconfigPaths',
    files: {},
    viteConfig: { resolve: { tsconfigPaths: true } },
    devPlugins: (start) => [start],
    devConfig: { resolve: { tsconfigPaths: true } },
  },
]

/**
 * A Vite dev server with Start's whole plugin (as `@tanstack/react-start`
 * passes it) and the alias resolver of `alias`, in the order the app lists
 * them.
 */
async function startAliasDevServer(
  alias: (typeof viteAliases)[number],
  importProtection: ImportProtectionOptions,
) {
  const recorder = violationRecorder(importProtection)
  const server = await createDevServer({
    dir: testsDir,
    prefix: '.start-dev-server-',
    registerCleanup: onTestFinished,
    files: { ...startPluginFiles, ...aliasApp },
    browser: true,
    symlinks: startRuntimeLinks(),
    config: alias.devConfig,
    plugins: ({ root }) => [
      clientFixturePlugin,
      ...alias.devPlugins(
        startPlugin(root, { importProtection: recorder.importProtection }),
      ),
    ],
  })
  return Object.assign(server, { violations: recorder.violations })
}

/**
 * The violation reported is `expectedReport` (in dev with behavior "error",
 * each time the import resolves).
 */
function expectAliasFailure(recorded: Recorded) {
  const reports = reportsOf(recorded)
  expect(reports).not.toEqual([])
  for (const report of reports) {
    expect(report).toEqual(expectedReport)
  }
}

// (Was a pin for vite-tsconfig-paths before Start: main reported the
// specifier of the nested resolution, `src/secret.server`, and no location.
// The Yuku host judges the raw specifier of the user's edge, whatever
// resolves it.)
describe.each(viteAliases)('vite: $alias', (alias) => {
  const reportTest = test

  reportTest(
    'the build fails, reporting the aliased specifier at its original line',
    async () => {
      const error = await rejection(
        buildStart({
          files: { ...aliasApp, ...alias.files },
          entry: 'src/entry.ts',
          viteConfig: alias.viteConfig,
        }),
      )
      expectAliasFailure(error)
    },
    timeout,
  )

  test(
    'dev: the importer gets a safe mock, and the denied file never runs',
    async () => {
      const server = await startAliasDevServer(alias, {})
      const { result } = await runViteClient(
        server,
        '/src/entry.ts',
        `${probeMockPrelude}
return { probe: probeMock(entry.widget(), 'MARK_SECRET'), loaded: globalThis.secretLoaded ?? null }`,
      )
      expect(result).toEqual({ probe: safeMock, loaded: null })
    },
    timeout,
  )

  reportTest(
    'dev with behavior error: the load fails, reporting the aliased specifier at its original line',
    async () => {
      const server = await startAliasDevServer(alias, {
        behavior: { dev: 'error' },
      })
      await rejection(server.load('/src/entry.ts'))
      expectAliasFailure(server)
    },
    timeout,
  )
})

describe('rsbuild: tsconfig paths', () => {
  test(
    'the build fails, reporting the aliased specifier at its original line',
    async () => {
      const error = await rejection(
        buildStart({
          bundler: 'rsbuild',
          files: aliasApp,
          entry: 'src/entry.ts',
        }),
      )
      expect(reportsOf(error)).toEqual([expectedReport])
    },
    timeout,
  )

  test(
    'dev: the importer gets a safe mock, and the denied file never runs',
    async () => {
      const recorder = violationRecorder()
      const server = await startRsbuildStartDevServer({
        compileTimeout,
        browser: true,
        hmr: false,
        files: aliasApp,
        start: { importProtection: recorder.importProtection },
      })
      // Nothing fails, on any channel
      expect(
        findDiagnostics(server.diagnostics, { severity: 'error' }),
      ).toEqual([])
      // The probe of `expectSafeMock`, run where the mock lives.
      const { result } = await captureConsole(() =>
        runInClient(
          server,
          `${probeMockPrelude}
return {
  probe: probeMock(globalThis.widget(), 'MARK_SECRET'),
  loaded: globalThis.secretLoaded ?? null,
}`,
        ),
      )
      expect(result).toEqual({ result: { probe: safeMock, loaded: null } })
      expect(reportsOf({ root: server.root, ...recorder })).toEqual([
        expectedReport,
      ])
    },
    timeout,
  )

  test(
    'dev with behavior error: the compile fails, reporting the aliased specifier at its original line',
    async () => {
      const recorder = violationRecorder({ behavior: { dev: 'error' } })
      const server = await startRsbuildStartDevServer({
        compileTimeout,
        browser: true,
        hmr: false,
        files: aliasApp,
        start: { importProtection: recorder.importProtection },
      })
      expect(reportsOf({ root: server.root, ...recorder })).toEqual([
        expectedReport,
      ])
    },
    timeout,
  )
})
