/**
 * Production client bundles carry nothing of the dev server's additions
 * (route HMR, React Refresh support) and no absolute path of the project,
 * per bundler and framework. The build decides production by its own
 * signal (the bundler's production mode), with `NODE_ENV` unset, and the
 * plugin's default for `addHmr`.
 *
 * The dev-only code to look for is what the dev server's output of the same
 * route contains, among known HMR and React Refresh names.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { build, frameworks, routeApp, routeHead } from './build-harness'
import { routerDevServer } from './dev-server'
import type { Bundler } from '@tanstack/compiler-test-utils/build-harness'
import type { Framework } from './build-harness'

const timeout = 120_000

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
)

const route = (
  framework: Framework,
) => `${routeHead(framework)}function Page() {
  return <p>MARK_PAGE</p>
}
function Failure() {
  return <p>MARK_FAILURE</p>
}
export const Route = createFileRoute('/')({
  loader: () => 'data',
  errorComponent: Failure,
  component: Page,
})
`

/**
 * Names of HMR APIs and React Refresh support. (`__TSR_ROUTER__` is not
 * one: the router sets it in production too.)
 */
const devOnlyCandidates: Record<string, RegExp> = {
  'import.meta.hot': /\bimport\.meta\.hot\b/,
  'import.meta.webpackHot': /\bimport\.meta\.webpackHot\b/,
  'module.hot': /\bmodule\.hot\b/,
  $RefreshReg$: /\$RefreshReg\$/,
  $RefreshSig$: /\$RefreshSig\$/,
  __TSR_REACT_REFRESH__: /__TSR_REACT_REFRESH__/,
  __getReactRefreshIgnoredExports: /__getReactRefreshIgnoredExports/,
  TSRFastRefreshAnchor: /TSRFastRefreshAnchor/,
  __TSR_COMPONENT_TYPES__: /__TSR_COMPONENT_TYPES__/,
}

/** URLs a transformed module imports dynamically. */
function dynamicImports(code: string) {
  return [...code.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)].map(
    (match) => match[1]!,
  )
}

const devMarkersByFramework = new Map<Framework, Promise<Array<string>>>()

/**
 * The dev-only names the dev server's client output of the route (the
 * route module and its split modules) contains, with Vite's and webpack's
 * HMR style.
 */
function devMarkers(framework: Framework) {
  let markers = devMarkersByFramework.get(framework)
  if (!markers) {
    markers = collectDevMarkers(framework)
    devMarkersByFramework.set(framework, markers)
  }
  return markers
}

async function collectDevMarkers(framework: Framework) {
  const found = new Set<string>()
  for (const style of ['vite', 'webpack'] as const) {
    const server = await routerDevServer({
      registerCleanup: undefined,
      pluginOptions: { target: framework, plugin: { hmr: { style } } },
      files: { 'routes/index.tsx': route(framework) },
    })
    try {
      const code = await server.transform('/routes/index.tsx', 'client')
      const modules = [
        code,
        ...(await Promise.all(
          dynamicImports(code).map((url) => server.transform(url, 'client')),
        )),
      ]
      for (const [name, pattern] of Object.entries(devOnlyCandidates)) {
        if (modules.some((module) => pattern.test(module))) {
          found.add(name)
        }
      }
    } finally {
      await server.close()
    }
  }
  return [...found].sort()
}

async function productionBuild(
  bundler: Bundler,
  framework: Framework,
  autoCodeSplitting: boolean,
) {
  const app = await build({
    bundler,
    framework,
    env: 'client',
    nodeEnv: null,
    pluginOptions: {
      autoCodeSplitting,
      codeSplittingOptions: { addHmr: undefined },
    },
    files: routeApp(route(framework), { env: 'client', framework }),
  })
  const run = await app.run(`await entry.mount(entry.Route.options.component)`)
  return { app, html: run.html }
}

/**
 * Builds the route for production and asserts that the bundle has none of
 * the dev-only code the dev server adds to it, and no absolute path of the
 * project.
 */
async function expectProductionClientBundle(
  bundler: Bundler,
  framework: Framework,
  autoCodeSplitting: boolean,
) {
  const markers = await devMarkers(framework)
  // The dev server adds route HMR code at least
  expect(markers.length).toBeGreaterThan(0)

  const { app, html } = await productionBuild(
    bundler,
    framework,
    autoCodeSplitting,
  )
  expect(html).toContain('MARK_PAGE')
  expect(
    markers.filter((name) => app.where(devOnlyCandidates[name]!) !== 'nowhere'),
  ).toEqual([])
  expect(
    app.chunks
      .filter((chunk) => chunk.code.includes(workspaceRoot))
      .map((chunk) => chunk.fileName),
  ).toEqual([])
}

describe.each(['vite', 'rspack', 'webpack'] as const)('%s', (bundler) => {
  test.each(frameworks)(
    'a production %s client bundle has no dev-only code and no absolute path',
    async (framework) => {
      await expectProductionClientBundle(bundler, framework, true)
    },
    timeout,
  )
})

test.each(['solid', 'vue'] as const)(
  'a production %s client bundle without code splitting has no dev-only code and no absolute path (vite)',
  async (framework) => {
    await expectProductionClientBundle('vite', framework, false)
  },
  timeout,
)

// Bug: same root cause as the pins below, on Vite: the route HMR plugin has
// no `apply: 'serve'` and follows `NODE_ENV` at plugin creation. Vite drops
// the code `import.meta.hot` guards, but not the React Refresh anchor export
// (`TSRFastRefreshAnchor`) the HMR compile adds to every React route. The
// Vite CLI sets `NODE_ENV` before loading the config; Vite's JavaScript API
// (`build({ plugins: [tanstackRouter(...)] })` from a script without
// `NODE_ENV`) does not.
// Source: router-composed-plugin.ts (`isProduction` from `NODE_ENV`),
// router-hmr-plugin.ts (no `apply`).
// Impact: production bundles built through Vite's API keep the refresh
// anchor of every React route.
test.fails(
  'a production react client bundle without code splitting has no dev-only code and no absolute path (vite)',
  async () => {
    await expectProductionClientBundle('vite', 'react', false)
  },
  timeout,
)

// Bug: with automatic code splitting off, the composed router plugin adds
// the route HMR plugin unless `NODE_ENV` is `production` when the plugin is
// created (`router-composed-plugin.ts`), instead of following the bundler's
// mode; webpack and Rspack set `NODE_ENV` only inside the bundle. Same root
// cause as the React pin in known-bugs-route-hmr.test.ts, for every
// framework.
// Source: gap CC-P1 / M3.
// Impact: webpack/Rspack production bundles built from a shell without
// `NODE_ENV` ship the route HMR code of every route.
describe.each(['rspack', 'webpack'] as const)('%s', (bundler) => {
  test.fails.each(frameworks)(
    'a production %s client bundle without code splitting has no dev-only code and no absolute path',
    async (framework) => {
      await expectProductionClientBundle(bundler, framework, false)
    },
    timeout,
  )
})

/** Records what is printed to the console (log, info, debug). */
function recordConsole() {
  const printed: Array<string> = []
  for (const method of ['log', 'info', 'debug'] as const) {
    vi.spyOn(console, method).mockImplementation((...args) => {
      printed.push(args.map(String).join(' '))
    })
  }
  return printed
}

afterEach(() => {
  vi.restoreAllMocks()
})

// The router plugin's debug output (the compiled code of every route) is
// opt-in (`TSR_VITE_DEBUG`).
// Source: r5-gaps N9 (rp:1543, 1592, 1597, 1605, 1619, 1738, 1743, 1936:
// debug output on by default).
test(
  'with default options, a build prints nothing to the console (split, unsplit and shared-binding routes)',
  async () => {
    expect(process.env.TSR_VITE_DEBUG).toBeUndefined()
    const printed = recordConsole()
    const app = await build({
      bundler: 'vite',
      env: 'client',
      files: routeApp(route('react'), {
        env: 'client',
        files: {
          // Nothing to split
          'routes/plain.tsx': `${routeHead('react')}export const Route = createFileRoute('/plain')({
  staticData: { label: 'MARK_PLAIN' },
})
`,
          // A binding the loader and the split component share
          'routes/shared.tsx': `${routeHead('react')}const shared = { label: 'MARK_SHARED' }
function Shared() {
  return <p>{shared.label}</p>
}
export const Route = createFileRoute('/shared')({
  loader: () => shared.label,
  component: Shared,
})
`,
          'entry.ts': `export * from './routes/index'
export { Route as PlainRoute } from './routes/plain'
export { Route as SharedRoute } from './routes/shared'
`,
        },
      }),
    })
    expect(app.where('MARK_SHARED')).not.toBe('nowhere')
    expect(printed).toEqual([])
  },
  timeout,
)
