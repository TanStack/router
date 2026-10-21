/**
 * Route HMR: the modules the compiler emits for development evaluate and
 * render with or without a hot API, keep no React code for Solid and Vue.
 * What the page shows after an edit is tested in a real dev server and a
 * real browser page (integration/route-hmr-browser*.test.ts); that a dev
 * server with `addHmr: false` applies no route HMR:
 * integration/route-hmr-dev-addhmr-off.test.ts; production bundles:
 * integration/build-production*.test.ts. Here: the route modules run where
 * a dev server runs them, with the real tools: a real page served by the
 * dev server (the real Vite client and its hot API, the framework's own
 * plugin), and the dev server's SSR module runner (`route-app.ts`).
 */
import { SourceMap } from 'node:module'
import { describe, expect, it, test } from 'vitest'
import { renderRoutePath, routerDevServer } from './dev-server'
import { expectValidModules, head, loadRoute } from './route-app'
import type { RouteApp, RouteAppOptions, TargetFramework } from './route-app'
import type { Plugin } from 'vite'

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

/**
 * Whether a request (a URL path a page fetched) loads a module of a React
 * package: React, React DOM or the React router, pre-bundled by the dev
 * server or served from its package directory.
 */
const reactPackage =
  /\/node_modules\/(?:\.vite\/deps\/(?:react|react-dom|@tanstack_react-router)[._-]|react\/|react-dom\/)|\/packages\/react-router\//

describe('the modules of a Solid or Vue route compiled with HMR', () => {
  // What the page shows after an edit, with the framework's own refresh:
  // integration/route-hmr-browser-frameworks.test.ts. Here: loading the
  // route and every option it splits in a page requests nothing of React
  // (resolved request provenance), and the route works with the
  // framework's router (source: add-hmr snapshot fixture
  // solid/arrow-function).
  test.each([
    { framework: 'solid', style: 'vite' },
    { framework: 'solid', style: 'webpack' },
    { framework: 'vue', style: 'vite' },
    { framework: 'vue', style: 'webpack' },
  ] as const)(
    '$framework ($style style): import the router package of the framework and no React code',
    async ({ framework, style }) => {
      const route = await loadRoute(
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
      const { html, requests } = await route.run<{
        html: string
        requests: Array<string>
      }>(`for (const option of ['component', 'errorComponent', 'pendingComponent', 'notFoundComponent', 'loader']) {
  await trigger(option)
}
const html = await renderRoute()
return {
  html,
  requests: performance.getEntriesByType('resource').map((entry) => new URL(entry.name).pathname),
}`)
      expect(html).toContain('posts')
      expect(requests.filter((request) => reactPackage.test(request))).toEqual(
        [],
      )
    },
  )
})

/**
 * A route app's tools: whether its modules see a hot API (Vite's
 * `import.meta.hot`, webpack's `import.meta.webpackHot`) and a `window`.
 */
const environmentProbe = {
  'environment.ts': `export const environment = {
  hot: typeof import.meta.hot,
  webpackHot: typeof (import.meta as any).webpackHot,
  window: typeof window,
}
`,
  // React's server renderer as an app's SSR code imports it
  'ssr-render.ts': `import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
export const render = (component: any) => renderToString(createElement(component))
`,
}

/** A user plugin of the app turning Vite's HMR off (`server.hmr: false`). */
const withoutHmr: Plugin = {
  name: 'app:no-hmr',
  config: () => ({ server: { hmr: false } }),
}

interface Host {
  name: string
  /** Where the route module runs: a page, or the SSR module runner. */
  side: 'page' | 'ssr'
  /** The dev server runs without HMR (no hot API in its modules). */
  noHmr?: boolean
  /** What the modules see there (checked: the row's precondition). */
  environment: { hot: string; webpackHot: string; window: string }
}

/**
 * Loads the route module where `host` runs it and returns the loader's
 * value, the component's HTML (after the router's `preload()` of a split
 * component), and what the modules see there.
 */
async function runWhere(route: RouteApp, host: Host) {
  if (host.side === 'page') {
    return route.run(`return {
  data: await options.loader(),
  html: await render('component'),
  environment: (await app('environment.ts')).environment,
}`)
  }
  // The dev server's SSR module runner: the route module, and React DOM's
  // server renderer as the app's SSR code imports it
  const { Route } = await route.host.importServer(route.url)
  const { render } = await route.host.importServer('/ssr-render.ts')
  const { environment } = await route.host.importServer('/environment.ts')
  const component = Route.options.component
  await component.preload?.()
  return {
    data: await Route.options.loader(),
    html: render(component),
    environment,
  }
}

describe('route modules compiled for the dev server', () => {
  // Source: #7074 / J3.8. Initial evaluation where the dev server runs the
  // route module: with the host's hot API or without one (a dev server
  // without HMR), in a page or in the SSR module runner (no `window`), and
  // no router on the page yet. Every emitted module is linked by the real
  // tools: a missing lazy target must not pass as a property. A page of a
  // Vite dev server always has Vite's hot API (also with `server.hmr:
  // false`); a page without a hot API, and webpack's hot API
  // (`import.meta.webpackHot`) present: Rsbuild's dev server,
  // integration/route-hmr-rsbuild-hosts.test.ts; webpack's hot API without a
  // `window`: a webpack or Rspack server build with hot module replacement,
  // integration/route-hmr-webpack-server-hosts.test.ts.
  const vite: Array<Host> = [
    {
      name: 'a page (hot API present, window)',
      side: 'page',
      environment: { hot: 'object', webpackHot: 'undefined', window: 'object' },
    },
    {
      name: 'the SSR module runner (hot API present, no window)',
      side: 'ssr',
      environment: {
        hot: 'object',
        webpackHot: 'undefined',
        window: 'undefined',
      },
    },
    {
      name: 'the SSR module runner of a dev server without HMR (no hot API, no window)',
      side: 'ssr',
      noHmr: true,
      environment: {
        hot: 'undefined',
        webpackHot: 'undefined',
        window: 'undefined',
      },
    },
  ]
  // The webpack style in Vite: Vite gives no `import.meta.webpackHot`
  const webpackInVite: Array<Host> = [
    { ...vite[0]!, name: 'a page (no webpack hot API, window)' },
    {
      ...vite[1]!,
      name: 'the SSR module runner (no webpack hot API, no window)',
    },
  ]

  describe.each([
    { style: 'vite', hosts: vite },
    { style: 'webpack', hosts: webpackInVite },
  ] as const)('$style style', ({ style, hosts }) => {
    describe.each([
      {
        name: 'a split route',
        route: fileRoute('data', 'component: PostsComponent,', posts('data')),
        html: '<div>posts data</div>',
      },
      {
        name: 'a root route',
        route: `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({
  loader: () => 'data',
  component: () => <div>root</div>,
})`,
        html: '<div>root</div>',
      },
    ])('$name', ({ route, html }) => {
      it.each(hosts)('renders and loads in $name', async (host) => {
        const options: RouteAppOptions = {
          hmr: true,
          pluginOptions: { plugin: { hmr: { style } } },
          files: environmentProbe,
          ...(host.noHmr && { plugins: { before: [withoutHmr] } }),
        }
        const loaded = await loadRoute(route, options)
        expect(await runWhere(loaded, host)).toEqual({
          data: 'data',
          html,
          environment: host.environment,
        })
      })
    })
  })

  it.each([false, true])(
    'renders a dev-SSR route and its loader through Vite (autoCodeSplitting: %s)',
    async (autoCodeSplitting) => {
      const server = await routerDevServer({
        pluginOptions: { autoCodeSplitting },
        files: {
          'routes/index.tsx': `${head}function Page() {
  return <p>SSR {Route.useLoaderData()}</p>
}
export const Route = createFileRoute('/')({ loader: () => 'data', component: Page })`,
        },
      })
      expect(await renderRoutePath(server, '/')).toContain(
        '<p>SSR <!-- -->data</p>',
      )
    },
    30_000,
  )

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
    await expectValidModules(route)
    expect(await route.groups()).toEqual([['component'], ['errorComponent']])
    expect(
      await route.run(
        `return [await render('component'), await render('errorComponent')]`,
      ),
    ).toEqual(['<p>page</p>', '<p>error</p>'])
  })

  // Source: add-hmr snapshot fixture explicit-undefined-component.
  it('keep an explicitly undefined component undefined', async () => {
    const route = await loadRoute(
      `${head}export const Route = createFileRoute('/')({
  component: undefined,
})`,
      { hmr: true },
    )
    await expectValidModules(route)
    expect(await route.isLazy('component')).toBe(false)
    expect(
      await route.run(
        `return ['component' in options, options.component === undefined]`,
      ),
    ).toEqual([true, true])
  })
})

// Route modules compiled without HMR (the add-hmr `@false` snapshots):
// a dev server with `addHmr: false` applies no route HMR:
// integration/route-hmr-dev-addhmr-off.test.ts; production bundles carry no
// dev-only code: integration/build-production.test.ts and
// build-production-webpack.test.ts (decided on the bundle, SPEC G7).

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

  // The route HMR plugin's debug output (opt-in, `TSR_VITE_DEBUG`) is not
  // emitted code: outside-compiler-corpus/route-hmr-debug-output.test.ts.

  // An edit of a `.ts` route file, the environment name, `plugin.hmr.style`
  // alone, plugin options given as a function and a `tsr.config.json`
  // target, on a real page: integration/route-hmr-browser-plugin.test.ts
  // (the environment the option names gets working route HMR) and
  // known-bugs-route-hmr.test.ts. Here: the environment
  // `plugin.vite.environmentName` excludes gets no route HMR code in any
  // module the environment serves from its route module: the router's
  // packages and any support module the compiler imports included. Left
  // out: Vite's own client, and packages the environment externalizes
  // (bare ids: Node loads the installed package itself).
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
      // Positive delivery control: integration/route-hmr-browser-plugin.test.ts
      // edits an environment-selected loader on a real page. The compiler
      // may delegate HMR to an imported helper instead of inlining an API.
      const served = await server.load('/routes/index.tsx', {
        environment: 'ssr',
        skip: /^\/@(?:vite|react-refresh)\b|^[^./]/,
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
