/**
 * Route HMR: editing a route file updates the live route in place, keeping
 * the identity of its components so that the framework's refresh patches
 * them without a remount, and nothing of it ships when HMR is off.
 *
 * What the page shows after an edit is tested in a real dev server and a
 * real browser page (`route-hmr-browser.test.ts`). Here: the route HMR code
 * the router plugin emits, run on its own with the bundler's hot API
 * (`hotUpdate`), compiled modules evaluated with `loadRoute` /
 * `evaluateModule`, and what the route HMR plugin serves in a real Vite dev
 * server.
 */
import { SourceMap } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import solid from 'vite-plugin-solid'
import { describe, expect, it, onTestFinished, test, vi } from 'vitest'
import {
  createDevServer,
  evaluateServed,
} from '@tanstack/compiler-test-utils/dev-server'
import {
  rootRouteOf,
  routerDevServer,
  servedRouterPackageUrl,
} from './dev-server'
import {
  compileRouteModules,
  evaluateModule,
  expectValidModules,
  head,
  hotUpdate,
  importSources,
  loadRoute,
} from './regression-helpers'
import type { TargetFramework } from './regression-helpers'

const harnessDir = path.dirname(fileURLToPath(import.meta.url))

/** A route file whose loader returns `data`, with its other options. */
const fileRoute = (
  data: string,
  options: string,
  declarations = '',
  framework: TargetFramework = 'react',
) => `import { createFileRoute } from '@tanstack/${framework}-router'
${declarations}
export const Route = createFileRoute('/')({
  loader: () => '${data}',
  ${options}
})`

/** Components whose text names the version of the route file. */
const posts = (version: string) => `function PostsComponent() {
  return <div>posts ${version}</div>
}
function PostsErrorComponent() {
  return <div>Error loading posts ${version}</div>
}`

/** The value a loader of the live route returns, split or not. */
async function loaderData(update: Awaited<ReturnType<typeof hotUpdate>>) {
  return (await update.load('loader')).call(undefined)
}

describe('the route HMR code of a Solid or Vue route', () => {
  // Source: add-hmr snapshot fixture solid/arrow-function. Solid and Vue
  // have no React Refresh to patch a kept component in place: the live route
  // gets the new component (webpack / Rspack style, the route module runs
  // again). What the page shows after an edit: route-hmr-browser.test.ts.
  test.each([
    { framework: 'solid', codeSplitting: true },
    { framework: 'vue', codeSplitting: true },
    { framework: 'solid', codeSplitting: false },
    { framework: 'vue', codeSplitting: false },
  ] as const)(
    '$framework (codeSplitting: $codeSplitting): applies the new options and component with the router package of the framework and no React code',
    async ({ framework, codeSplitting }) => {
      const route = (version: string) =>
        fileRoute(
          version,
          'component: PostsComponent,',
          `function PostsComponent() {
  return <div>posts ${version}</div>
}`,
          framework,
        )
      const update = await hotUpdate(route('old'), {
        style: 'webpack',
        targetFramework: framework,
        codeSplitting,
        updated: route('new'),
      })
      expect(update.invalidated).toBe(false)
      expect(await loaderData(update)).toBe('new')
      expect((await update.load('component'))()).toBe('<div>posts new</div>')
      // No React code.
      expect(Object.keys(update.window)).toEqual(['__TSR_ROUTER__'])
      for (const style of ['vite', 'webpack'] as const) {
        const { modules } = compileRouteModules(route('old'), {
          targetFramework: framework,
          hmr: true,
          pluginOptions: { plugin: { hmr: { style } } },
        })
        for (const code of Object.values(modules)) {
          expect(importSources(code)).not.toContain('react')
          expect(importSources(code)).not.toContain('@tanstack/react-router')
        }
      }
    },
  )
})

describe('the route HMR code of a route whose options a factory call builds', () => {
  // webpack and Rspack run the route module again: its HMR code applies the
  // options the new factory call built. (In Vite, the edit may reload the
  // page instead; either way the edit shows: route-hmr-browser.test.ts.)
  it('webpack: applies the new options', async () => {
    const factoryRoute = (
      data: string,
    ) => `import { createFileRoute } from '@tanstack/react-router'
import { makeOptions } from './options'
export const Route = createFileRoute('/')(makeOptions('${data}'))`
    const update = await hotUpdate(factoryRoute('old'), {
      style: 'webpack',
      updated: factoryRoute('new'),
      stubs: {
        './options': {
          makeOptions: (data: string) => ({ loader: () => data }),
        },
      },
    })
    expect(update.invalidated).toBe(false)
    expect(await loaderData(update)).toBe('new')
  })
})

describe('the route a hot update applies to', () => {
  // Source: add-hmr "prefers the current generated route id over stale Vite
  // hot data". The route file was registered under another route id when
  // its previous version loaded (e.g. before a route configuration change);
  // the hot data its HMR code wrote still names that route.
  // Vite only: the webpack HMR code deliberately reads the previous route id
  // from hot data (webpack-adapter.ts).
  it('vite: is the route the file is registered under now, not the one it was registered under before', async () => {
    const route = (data: string) => fileRoute(data, '')
    const update = await hotUpdate(route('old'), {
      codeSplitting: true,
      previousRouteId: '/stale',
      updated: route('new'),
    })
    expect(await loaderData(update)).toBe('new')
  })
})

describe('route modules compiled for the dev server', () => {
  const router = {
    createFileRoute: () => (options: unknown) => ({ options }),
    createRootRoute: (options: unknown) => ({ options }),
    lazyRouteComponent: () => () => null,
    lazyFn: () => () => null,
  }

  // Source: #7074 (gap H13). Bundlers do not always provide `hot.data`, or
  // `import.meta.hot` at all (a module loaded outside the HMR runtime).
  describe.each([
    {
      name: 'a split route',
      route: fileRoute(
        'data',
        'component: Page,',
        posts('data').replace('PostsComponent', 'Page'),
      ),
    },
    {
      name: 'an unsplittable root route',
      route: `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({ component: () => <div>root</div> })`,
    },
  ])('$name', ({ route }) => {
    const { reference } = compileRouteModules(route, { hmr: true }).modules
    it.each([
      { name: 'a hot API without data', hot: { accept() {}, dispose() {} } },
      { name: 'no hot API', hot: undefined },
    ])('evaluates with $name', async ({ hot }) => {
      for (const window of [undefined, {}]) {
        vi.stubGlobal('window', window)
        try {
          const { Route } = await evaluateModule(
            reference!,
            { '@tanstack/react-router': router },
            { importMeta: { hot } },
          )
          expect(Route).toHaveProperty('options.component')
        } finally {
          vi.unstubAllGlobals()
        }
      }
    })
  })

  // Source: add-hmr snapshot fixture string-literal-keys.
  it('split options under quoted keys like the others', async () => {
    const route = await loadRoute(
      `${head}function Page() {
  return <p>page</p>
}
function Err() {
  return <p>error</p>
}
export const Route = createFileRoute('/')({ 'component': Page, 'errorComponent': Err })`,
      { hmr: true },
    )
    await expectValidModules(route.modules)
    expect(await route.groups()).toEqual([['component'], ['errorComponent']])
    expect(await route.render('component')).toBe('<p>page</p>')
    expect(await route.render('errorComponent')).toBe('<p>error</p>')
  })

  // Source: add-hmr snapshot fixture explicit-undefined-component.
  it('keep an explicitly undefined component undefined', async () => {
    const route = await loadRoute(
      `${head}export const Route = createFileRoute('/')({
  component: undefined,
})`,
      { hmr: true, refresh: true },
    )
    await expectValidModules(route.modules)
    expect(await route.isLazy('component')).toBe(false)
    expect('component' in route.options).toBe(true)
    expect(route.options.component).toBeUndefined()
  })
})

describe('route modules compiled without HMR', () => {
  // Source: the add-hmr `@false` snapshots (every fixture compiled with
  // `addHmr: false`).
  const routes = [
    {
      name: 'a split route',
      route: fileRoute('data', 'component: PostsComponent,', posts('data')),
    },
    {
      name: 'a route with two split components',
      route: fileRoute(
        'data',
        'component: PostsComponent,\n  errorComponent: PostsErrorComponent,',
        posts('data'),
      ),
    },
    {
      name: 'a route with lowercase components',
      route: `${head}export const Route = createFileRoute('/')({
  pendingComponent: pendingComponent,
  errorComponent: errorComponent,
  component: component,
})
function pendingComponent() {
  return <div>Pending</div>
}
function errorComponent() {
  return <div>Error</div>
}
function component() {
  return <div>Hello</div>
}`,
    },
    {
      name: 'a root route',
      route: `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({
  shellComponent: ({ children }) => <html>{children}</html>,
  component: () => <div>root</div>,
})`,
    },
    {
      name: 'a root route with context',
      route: `import { createRootRouteWithContext } from '@tanstack/react-router'
interface MyRouterContext {
  auth: boolean
}
export const Route = createRootRouteWithContext<MyRouterContext>()({
  component: RootComponent,
})
function RootComponent() {
  return <div>Hello</div>
}`,
    },
    {
      name: 'an explicitly undefined component',
      route: `${head}export const Route = createFileRoute('/')({ component: undefined })`,
    },
    {
      name: 'a Solid route',
      route: fileRoute(
        'data',
        'component: PostsComponent,',
        posts('data'),
        'solid',
      ),
      targetFramework: 'solid' as const,
    },
  ]

  // A production build (`addHmr` unset), and a dev server with `addHmr:
  // false`.
  describe.each([
    {
      mode: 'production',
      options: {
        command: 'build',
        pluginOptions: { codeSplittingOptions: { addHmr: undefined } },
      },
    },
    {
      mode: 'development with addHmr disabled',
      options: { command: 'serve', hmr: false },
    },
  ] as const)('in $mode', ({ options }) => {
    it.each(routes)(
      'have no HMR code ($name)',
      ({ route, targetFramework }) => {
        const loaded = compileRouteModules(route, {
          targetFramework,
          ...options,
        })
        for (const [name, code] of Object.entries(loaded.modules)) {
          expect(code, name).not.toMatch(/import\.meta\.(?:webpackHot|hot)\b/)
        }
      },
    )
  })
})

// The route HMR plugin that `tanstackRouter` adds in development when
// automatic code splitting is off, in a Vite dev server.
describe('route HMR in a Vite dev server without automatic code splitting', () => {
  const timeout = 30_000
  // Vite's SSR transform serves `import.meta` as `__vite_ssr_import_meta__`
  const hasRouteHmr = (code: string) =>
    /(?:import\.meta|__vite_ssr_import_meta__)\.hot\b/.test(code)
  const loaderRoute = (target: TargetFramework = 'react') =>
    `import { createFileRoute } from '@tanstack/${target}-router'
export const Route = createFileRoute('/')({ loader: () => 'x' })`

  // The route HMR plugin's debug output is opt-in (`TSR_VITE_DEBUG`). The
  // other debug output tests live in
  // `outside-compiler-corpus/route-hmr-debug-output.test.ts`.
  // Source: r5-gaps N9 (rp:1420, 1442, 1455, 1936: debug output on by
  // default).
  test(
    'with default options, serving a route prints nothing to the console',
    async () => {
      expect(process.env.TSR_VITE_DEBUG).toBeUndefined()
      const printed: Array<string> = []
      for (const method of ['log', 'info', 'debug'] as const) {
        vi.spyOn(console, method).mockImplementation((...args) => {
          printed.push(args.map(String).join(' '))
        })
      }
      const server = await routerDevServer({
        pluginOptions: { autoCodeSplitting: false },
        files: {
          'routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ loader: () => 'x', component: () => <p>x</p> })`,
        },
      })
      expect(
        hasRouteHmr(await server.transform('/routes/index.tsx', 'client')),
      ).toBe(true)
      vi.restoreAllMocks()
      expect(printed).toEqual([])
    },
    timeout,
  )

  test(
    'reaches route files without JSX (.ts)',
    async () => {
      const server = await routerDevServer({
        pluginOptions: { autoCodeSplitting: false },
        files: { 'routes/index.ts': loaderRoute() },
      })
      expect(
        hasRouteHmr(await server.transform('/routes/index.ts', 'client')),
      ).toBe(true)
    },
    timeout,
  )

  test(
    'is limited to the environment plugin.vite.environmentName names',
    async () => {
      const server = await routerDevServer({
        pluginOptions: {
          autoCodeSplitting: false,
          plugin: { vite: { environmentName: 'client' } },
        },
        files: { 'routes/index.tsx': loaderRoute() },
      })
      expect(
        hasRouteHmr(await server.transform('/routes/index.tsx', 'client')),
      ).toBe(true)
      expect(
        hasRouteHmr(await server.transform('/routes/index.tsx', 'ssr')),
      ).toBe(false)
    },
    timeout,
  )

  test(
    'works with plugin.hmr.style alone',
    async () => {
      const server = await routerDevServer({
        pluginOptions: {
          autoCodeSplitting: false,
          plugin: { hmr: { style: 'vite' } },
        },
        files: { 'routes/index.tsx': loaderRoute() },
      })
      expect(
        hasRouteHmr(await server.transform('/routes/index.tsx', 'client')),
      ).toBe(true)
    },
    timeout,
  )

  // Solid and Vue route modules only get the route HMR code; React ones also
  // get React Refresh's, which installs its hooks on `window` when the
  // module runs in the page.
  test.each([
    { target: 'solid', reactRefreshHooks: false },
    { target: 'react', reactRefreshHooks: true },
  ] as const)(
    'compiles for the target of a tsr.config.json in the Vite root ($target)',
    async ({ target, reactRefreshHooks }) => {
      const server = await routerDevServer({
        pluginOptions: null,
        // A Solid app's SSR environment needs vite-plugin-solid (the
        // router's Solid build)
        plugins: target === 'solid' ? [solid({ ssr: true })] : [],
        files: {
          'tsr.config.json': JSON.stringify({
            target,
            routesDirectory: './routes',
            generatedRouteTree: './routeTree.gen.ts',
          }),
          'routes/index.tsx': `import { createFileRoute } from '@tanstack/${target}-router'
export const Route = createFileRoute('/')({ loader: () => 'x', component: () => <p>x</p> })`,
        },
      })
      const window = {}
      vi.stubGlobal('window', window)
      try {
        // As the page loads it (the router package as the SSR environment
        // loaded it, the JSX runtime stubbed)
        const { Route } = await evaluateServed(server, '/routes/index.tsx', {
          skip: /^\/@fs\/|\/node_modules\/|^\/@vite\b/,
          stubs: {
            [await servedRouterPackageUrl(server, target)]: await server.import(
              `@tanstack/${target}-router`,
            ),
          },
          fallbackStub: (_, names) =>
            Object.fromEntries([...names].map((name) => [name, () => null])),
        })
        expect(await Route.options.loader()).toBe('x')
        expect(Object.keys(window).length > 0).toBe(reactRefreshHooks)
      } finally {
        vi.unstubAllGlobals()
      }
    },
    timeout,
  )

  test(
    'takes plugin options given as a function',
    async () => {
      const { tanstackRouter } = await import('../src/vite')
      const { getConfig } = await import('../src/core/config')
      const server = await createDevServer({
        dir: harnessDir,
        prefix: '.router-dev-server-',
        registerCleanup: onTestFinished,
        files: {
          'routes/__root.tsx': rootRouteOf('solid'),
          'routes/index.tsx': loaderRoute('solid'),
        },
        plugins: (app) => [
          tanstackRouter(() =>
            getConfig(
              {
                target: 'solid',
                autoCodeSplitting: false,
                routesDirectory: path.join(app.root, 'routes'),
                generatedRouteTree: path.join(app.root, 'routeTree.gen.ts'),
              },
              app.root,
            ),
          ),
          solid({ ssr: true }),
        ],
      })
      expect(
        hasRouteHmr(await server.transform('/routes/index.tsx', 'client')),
      ).toBe(true)
      const routeModule = await server.import('/routes/index.tsx')
      expect(await routeModule.Route.options.loader()).toBe('x')
    },
    timeout,
  )

  // Stack traces and breakpoints of route files in development.
  test.each(['react', 'solid', 'vue'] as const)(
    'maps the served %s route module to the lines of the route file',
    async (target) => {
      const route = `import { createFileRoute } from '@tanstack/${target}-router'


// comment

export const Route = createFileRoute('/')({
  loader: () => {
    const value = [1, 2, 3].map((n) => n * 2).filter((n) => n > 2)


    throw new Error('MARK_THROW ' + value.length)
  },
})
`
      const server = await routerDevServer({
        pluginOptions: { target, autoCodeSplitting: false },
        files: { 'routes/index.tsx': route },
      })
      const result =
        await server.vite.environments.client.transformRequest(
          '/routes/index.tsx',
        )
      const code = result!.code
      const before = code.slice(0, code.indexOf('throw new Error'))
      const line = before.split('\n').length - 1
      const column = before.length - before.lastIndexOf('\n') - 1
      const entry = new SourceMap(result!.map as any).findEntry(
        line,
        column,
      ) as { originalLine: number }
      expect(entry.originalLine + 1).toBe(
        route.slice(0, route.indexOf('throw new Error')).split('\n').length,
      )
    },
    timeout,
  )
})
