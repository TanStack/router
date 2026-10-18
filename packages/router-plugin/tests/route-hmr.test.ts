/**
 * Route HMR: the modules the compiler emits for development evaluate and
 * render with or without a hot API, keep no React code for Solid and Vue,
 * and carry no HMR code when HMR is off. What the page shows after an edit
 * is tested in a real dev server and a real browser page
 * (integration/route-hmr-browser*.test.ts); here: compiled modules
 * evaluated with `loadRoute` / `evaluateModule`, and what the route HMR
 * plugin serves to each Vite environment.
 */
import { SourceMap } from 'node:module'
import { describe, expect, it, test, vi } from 'vitest'
import { routerDevServer } from './dev-server'
import {
  compileRouteModules,
  evaluateModule,
  expectValidModules,
  head,
  importSources,
  loadRoute,
} from './regression-helpers'
import type { TargetFramework } from './regression-helpers'

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

describe('the modules of a Solid or Vue route compiled with HMR', () => {
  // What the page shows after an edit, with the framework's own refresh:
  // integration/route-hmr-browser-frameworks.test.ts. Here: the emitted
  // modules import nothing of React (source: add-hmr snapshot fixture
  // solid/arrow-function).
  test.each([
    { framework: 'solid', style: 'vite' },
    { framework: 'solid', style: 'webpack' },
    { framework: 'vue', style: 'vite' },
    { framework: 'vue', style: 'webpack' },
  ] as const)(
    '$framework ($style style): import the router package of the framework and no React code',
    ({ framework, style }) => {
      const { modules } = compileRouteModules(
        fileRoute(
          'data',
          'component: PostsComponent,',
          `function PostsComponent() {
  return <div>posts</div>
}`,
          framework,
        ),
        {
          targetFramework: framework,
          hmr: true,
          pluginOptions: { plugin: { hmr: { style } } },
        },
      )
      expect(importSources(modules.reference!)).toContain(
        `@tanstack/${framework}-router`,
      )
      for (const code of Object.values(modules)) {
        expect(importSources(code)).not.toContain('react')
        expect(importSources(code)).not.toContain('@tanstack/react-router')
      }
    },
  )
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
          expect(code, name).not.toMatch(
            /import\.meta\.(?:webpackHot|hot)\b|\bmodule\.hot\b/,
          )
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

  // An edit of a `.ts` route file, the environment name, `plugin.hmr.style`
  // alone, plugin options given as a function and a `tsr.config.json`
  // target, on a real page: integration/route-hmr-browser-plugin.test.ts
  // and known-bugs-route-hmr.test.ts. Here: the environment
  // `plugin.vite.environmentName` excludes gets no route HMR code in any
  // module of the served route.
  test(
    'serves no route HMR code to an environment plugin.vite.environmentName does not name',
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
      const served = await server.load('/routes/index.tsx', {
        environment: 'ssr',
        skip: /^\/@fs\/|\/node_modules\/|^\/@vite\b/,
      })
      for (const [url, code] of Object.entries(served)) {
        expect(hasRouteHmr(code), url).toBe(false)
      }
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
