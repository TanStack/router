/**
 * Route HMR: editing a route file updates the live route in place, keeping
 * the identity of its components so that the framework's refresh can patch
 * them without a remount, and nothing of it ships when HMR is off.
 *
 * Hot updates run with `hotUpdate` (a real `RouterCore` and route classes);
 * compiled modules are evaluated with `loadRoute` / `evaluateModule`; what
 * the route HMR plugin serves is read from a Vite dev server.
 */
import { SourceMap } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDevServer } from '@tanstack/compiler-test-utils/dev-server'
import { describe, expect, it, onTestFinished, test, vi } from 'vitest'
import { rootRouteOf, routerDevServer, routerPackageStub } from './dev-server'
import {
  compileRouteModules,
  evaluateModule,
  expectValidModules,
  generatedRouteId,
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

const posts = `function PostsComponent() {
  return <div>posts</div>
}
function PostsErrorComponent() {
  return <div>Error loading posts</div>
}`

/**
 * Split routes and the component options each one splits. Each fixture is a
 * function of the loader's data, so the update can tell the new module's
 * loader apart.
 */
const splitRoutes = [
  {
    name: 'an arrow function component',
    route: (data: string) =>
      fileRoute(data, 'component: PostsComponent,', '').concat(
        '\nconst PostsComponent = () => <div>posts</div>',
      ),
    components: ['component'],
  },
  {
    name: 'a function declaration component',
    route: (data: string) =>
      fileRoute(data, 'component: PostsComponent,', posts),
    components: ['component'],
  },
  {
    name: 'two split components',
    route: (data: string) =>
      fileRoute(
        data,
        'component: PostsComponent,\n  errorComponent: PostsErrorComponent,',
        posts,
      ),
    components: ['component', 'errorComponent'],
  },
  {
    name: 'components under quoted keys',
    route: (data: string) =>
      fileRoute(
        data,
        `'component': PostsComponent,\n  'errorComponent': PostsErrorComponent,`,
        posts,
      ),
    components: ['component', 'errorComponent'],
  },
  {
    name: 'a split loader in its own chunk',
    route: (data: string) =>
      fileRoute(
        data,
        `component: PostsComponent,\n  codeSplitGroupings: [['loader'], ['component']],`,
        posts,
      ),
    components: ['component'],
  },
]

/** What each component option of `splitRoutes` renders. */
const rendered: Record<string, string> = {
  component: '<div>posts</div>',
  errorComponent: '<div>Error loading posts</div>',
}

/** The value a loader of the live route returns, split or not. */
async function loaderData(update: Awaited<ReturnType<typeof hotUpdate>>) {
  return (await update.load('loader')).call(undefined)
}

describe('a hot update of a split route', () => {
  // Source: add-hmr snapshot fixtures arrow-function, function-declaration,
  // multi-component and string-literal-keys (React, Vite and webpack); the
  // split loader row replaces react-refresh-route-components "does not keep
  // a split loader in the HMR data".
  describe.each(['vite', 'webpack'] as const)('%s', (style) => {
    it.each(splitRoutes)(
      'keeps the split components and applies the new options ($name)',
      async ({ route, components }) => {
        const update = await hotUpdate(route('old'), {
          style,
          codeSplitting: true,
          refresh: true,
          updated: route('new'),
        })
        expect(update.invalidated).toBe(false)
        for (const option of components) {
          expect(update.isLazy(option), option).toBe(true)
          expect(update.live[option], option).toBe(update.previous[option])
          // Each kept component still renders its own component
          expect((await update.load(option))(), option).toBe(rendered[option])
        }
        expect(await loaderData(update)).toBe('new')
      },
    )
  })

  // A split component that reads the route, next to a loader that calls an
  // import. Source: add-hmr snapshot fixtures (main) whose component reads
  // `Route.*`.
  describe.each([
    { style: 'vite', codeSplitting: true },
    { style: 'webpack', codeSplitting: true },
    { style: 'vite', codeSplitting: false },
    { style: 'webpack', codeSplitting: false },
  ] as const)('$style (codeSplitting: $codeSplitting)', (options) => {
    it('updates a route whose component reads the route and whose loader calls an import', async () => {
      const route = (
        data: string,
      ) => `import { createFileRoute } from '@tanstack/react-router'
import { fetchData } from './api'
function Page() {
  return <div>{Route.fullPath}</div>
}
export const Route = createFileRoute('/posts')({
  loader: () => fetchData('${data}'),
  component: Page,
})`
      const update = await hotUpdate(route('old'), {
        ...options,
        refresh: true,
        routeId: '/posts',
        updated: route('new'),
        stubs: { './api': { fetchData: (data: string) => data } },
      })
      expect(update.invalidated).toBe(false)
      expect(update.live.component).toBe(update.previous.component)
      expect(await loaderData(update)).toBe('new')
      expect((await update.load('component'))()).toBe('<div>/posts</div>')
    })
  })

  /** A Solid or Vue split route, compiled for the dev server. */
  const frameworkRoute = (framework: TargetFramework) => (data: string) =>
    fileRoute(data, 'component: PostsComponent,', posts, framework)

  // Source: add-hmr snapshot fixture solid/arrow-function.
  test.each(['solid', 'vue'] as const)(
    '%s: applies the new options with the router package of the framework',
    async (framework) => {
      const route = frameworkRoute(framework)
      const update = await hotUpdate(route('old'), {
        targetFramework: framework,
        codeSplitting: true,
        updated: route('new'),
      })
      expect(update.invalidated).toBe(false)
      expect(await loaderData(update)).toBe('new')
      expect((await update.load('component'))()).toBe('<div>posts</div>')
      // No React code: React Refresh's hooks on `window` are never installed.
      expect(Object.keys(update.window)).toEqual(['__TSR_ROUTER__'])
      const { modules } = compileRouteModules(route('old'), {
        targetFramework: framework,
        hmr: true,
      })
      for (const code of Object.values(modules)) {
        expect(importSources(code)).not.toContain('react')
        expect(importSources(code)).not.toContain('@tanstack/react-router')
      }
    },
  )

  // Bug: route HMR keeps the previous split components only for React: for
  // Solid and Vue, the route module creates a new lazy component on every
  // update and `handleRouteUpdate` keeps no component option
  // (`getFrameworkHmrCompilerPlugins` returns no plugin and the kept
  // component keys are empty for other targets).
  // Impact: every edit of a Solid or Vue route file remounts the route's
  // component, losing its state, instead of patching it in place.
  // Source: decision D10 (Solid/Vue split components keep their identity
  // across hot updates, as React's do); gaps H8/H9.
  test.fails.each(['solid', 'vue'] as const)(
    '%s: keeps the split component',
    async (framework) => {
      const route = frameworkRoute(framework)
      const update = await hotUpdate(route('old'), {
        targetFramework: framework,
        codeSplitting: true,
        updated: route('new'),
      })
      expect(update.live.component).toBe(update.previous.component)
    },
  )
})

describe('a hot update of a root route', () => {
  const root = (
    data: string,
  ) => `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({
  loader: () => '${data}',
  component: RootComponent,
})
function RootComponent() {
  return <div>Hello</div>
}`

  // Source: add-hmr snapshot fixture createRootRoute and the generated root
  // route id (`/__root`) test.
  it.each(['vite', 'webpack'] as const)(
    '%s: reaches the root route, keeps its component and applies the new loader',
    async (style) => {
      const update = await hotUpdate(root('old'), {
        style,
        codeSplitting: true,
        refresh: true,
        routeId: await generatedRouteId('__root.tsx'),
        updated: root('new'),
      })
      expect(update.invalidated).toBe(false)
      expect(update.live.component).toBe(update.previous.component)
      expect(update.live.component).toBeTypeOf('function')
      expect(await loaderData(update)).toBe('new')
    },
  )
})

describe('a hot update of an unsplit route', () => {
  const componentOptions = [
    'component',
    'shellComponent',
    'pendingComponent',
    'errorComponent',
    'notFoundComponent',
  ]
  /** A route at `/` with a component for each of `options` rendering `text`. */
  const route = (data: string, options: Array<string>, text = 'page') =>
    fileRoute(
      data,
      options.map((option) => `${option}: () => <p>${text}</p>,`).join('\n  '),
    )

  it.each(['vite', 'webpack'] as const)(
    '%s: keeps every component option and applies the new loader',
    async (style) => {
      const update = await hotUpdate(route('old', componentOptions), {
        style,
        refresh: true,
        updated: route('new', componentOptions),
      })
      expect(update.invalidated).toBe(false)
      for (const option of componentOptions) {
        expect(update.live[option], option).toBeTypeOf('function')
        expect(update.live[option], option).toBe(update.previous[option])
      }
      expect(await loaderData(update)).toBe('new')
    },
  )

  // A shell component changes the tree the route renders in, so the
  // components cannot be patched in place.
  it.each(['vite', 'webpack'] as const)(
    '%s: renders the new component when the update adds a shell component',
    async (style) => {
      const update = await hotUpdate(route('old', ['component'], 'old'), {
        style,
        refresh: true,
        updated: route('new', ['component', 'shellComponent'], 'new'),
      })
      expect(update.invalidated).toBe(false)
      expect(update.live.component).toBe(update.created.at(-1)!.component)
      expect((update.live.component as () => string)()).toBe('<p>new</p>')
    },
  )

  it.each(['vite', 'webpack'] as const)(
    '%s: drops a component option the update removes',
    async (style) => {
      const update = await hotUpdate(
        route('old', ['component', 'errorComponent']),
        { style, refresh: true, updated: route('new', ['component']) },
      )
      expect(update.live.errorComponent).toBeUndefined()
      expect(update.live.component).toBe(update.previous.component)
    },
  )

  it.each(['vite', 'webpack'] as const)(
    '%s: renders a component option the update adds',
    async (style) => {
      const update = await hotUpdate(route('old', ['component']), {
        style,
        refresh: true,
        updated: route('new', ['component', 'errorComponent'], 'added'),
      })
      expect((update.live.errorComponent as () => string)()).toBe(
        '<p>added</p>',
      )
    },
  )

  // Solid and Vue have no React Refresh to patch a kept component in place,
  // so the update renders the new one.
  test.each(['solid', 'vue'] as const)(
    '%s: renders the new component',
    async (framework) => {
      const source = (text: string) =>
        fileRoute(text, `component: () => <p>${text}</p>,`, '', framework)
      const update = await hotUpdate(source('old'), {
        targetFramework: framework,
        updated: source('new'),
      })
      expect(update.invalidated).toBe(false)
      expect((update.live.component as () => string)()).toBe('<p>new</p>')
      expect(await loaderData(update)).toBe('new')
      expect(Object.keys(update.window)).toEqual(['__TSR_ROUTER__'])
    },
  )

  it.each(['vite', 'webpack'] as const)(
    '%s: applies route options a factory call builds',
    async (style) => {
      const source = (
        data: string,
      ) => `import { createFileRoute } from '@tanstack/react-router'
import { makeOptions } from './options'
export const Route = createFileRoute('/')(makeOptions('${data}'))`
      const update = await hotUpdate(source('old'), {
        style,
        updated: source('new'),
        stubs: {
          './options': {
            makeOptions: (data: string) => ({ loader: () => data }),
          },
        },
      })
      expect(await loaderData(update)).toBe('new')
    },
  )
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
        posts.replace('PostsComponent', 'Page'),
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
    expect([route.isLazy('component'), route.isLazy('errorComponent')]).toEqual(
      [true, true],
    )
    expect((await route.load('component'))()).toBe('<p>page</p>')
    expect((await route.load('errorComponent'))()).toBe('<p>error</p>')
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
    expect(route.isLazy('component')).toBe(false)
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
      route: fileRoute('data', 'component: PostsComponent,', posts),
    },
    {
      name: 'a route with two split components',
      route: fileRoute(
        'data',
        'component: PostsComponent,\n  errorComponent: PostsErrorComponent,',
        posts,
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
      route: fileRoute('data', 'component: PostsComponent,', posts, 'solid'),
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
      async ({ route, targetFramework }) => {
        const loaded = await loadRoute(route, { targetFramework, ...options })
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

  // The route HMR plugin's debug output is opt-in (`TSR_VITE_DEBUG`).
  // Source: r5-gaps N9 (rp:1420, 1442, 1455, 1936: debug output on by
  // default).
  test.each(['react', 'solid'] as const)(
    'with default options, serving a %s route prints nothing to the console',
    async (target) => {
      expect(process.env.TSR_VITE_DEBUG).toBeUndefined()
      const printed: Array<string> = []
      for (const method of ['log', 'info', 'debug'] as const) {
        vi.spyOn(console, method).mockImplementation((...args) => {
          printed.push(args.map(String).join(' '))
        })
      }
      const server = await routerDevServer({
        pluginOptions: { target, autoCodeSplitting: false },
        plugins: [routerPackageStub(target)],
        files: {
          'routes/__root.tsx': rootRouteOf(target),
          'routes/index.tsx': `import { createFileRoute } from '@tanstack/${target}-router'
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

  // `TSR_VITE_DEBUG` scopes debug output by package: `start-plugin-core`
  // (start-plugin-core/src/debug.ts) is Start's, not the router plugin's.
  // Source: r5-gaps borderline rp:1938 (any set value turning router-plugin
  // debug output on).
  test(
    "with TSR_VITE_DEBUG=start-plugin-core, serving a route prints nothing of the router plugin's debug output",
    async () => {
      const printed: Array<string> = []
      for (const method of ['log', 'info', 'debug'] as const) {
        vi.spyOn(console, method).mockImplementation((...args) => {
          printed.push(args.map(String).join(' '))
        })
      }
      vi.stubEnv('TSR_VITE_DEBUG', 'start-plugin-core')
      // (the plugin reads the variable when its modules load)
      vi.resetModules()
      const { tanstackRouter } = await import('../src/vite')
      vi.unstubAllEnvs()
      const server = await createDevServer({
        dir: harnessDir,
        prefix: '.router-dev-server-',
        registerCleanup: onTestFinished,
        files: {
          'routes/__root.tsx': rootRouteOf('react'),
          'routes/index.tsx': loaderRoute('react'),
        },
        plugins: (app) => [
          tanstackRouter({
            target: 'react',
            autoCodeSplitting: false,
            routesDirectory: path.join(app.root, 'routes'),
            generatedRouteTree: path.join(app.root, 'routeTree.gen.ts'),
          }),
          routerPackageStub('react'),
        ],
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
        plugins: [routerPackageStub('react')],
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
        plugins: [routerPackageStub('react')],
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
        plugins: [routerPackageStub('react')],
        files: { 'routes/index.tsx': loaderRoute() },
      })
      expect(
        hasRouteHmr(await server.transform('/routes/index.tsx', 'client')),
      ).toBe(true)
    },
    timeout,
  )

  // Solid and Vue route modules only get the route HMR code; React ones are
  // also compiled for React Refresh.
  test(
    'compiles for the target of a tsr.config.json in the Vite root',
    async () => {
      const server = await routerDevServer({
        pluginOptions: null,
        plugins: [routerPackageStub('solid')],
        files: {
          'tsr.config.json': JSON.stringify({
            target: 'solid',
            routesDirectory: './routes',
            generatedRouteTree: './routeTree.gen.ts',
          }),
          'routes/index.tsx': `import { createFileRoute } from '@tanstack/solid-router'
export const Route = createFileRoute('/')({ loader: () => 'x', component: () => <p>x</p> })`,
        },
      })
      const routeModule = await server.import('/routes/index.tsx')
      expect(Object.keys(routeModule)).toEqual(['Route'])
      expect(await routeModule.Route.options.loader()).toBe('x')
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
          routerPackageStub('solid'),
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
        plugins: [routerPackageStub(target)],
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
