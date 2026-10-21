/**
 * Route modules compiled for the dev server evaluate and render where an
 * Rsbuild dev server runs them (SPEC J3.8): a page with webpack's hot API
 * (`import.meta.webpackHot`), a page of a dev server without HMR (no hot
 * API, a `window`), and Rsbuild's server environment (no `window`). The
 * Vite hosts of the same rows: route-hmr.test.ts "route modules compiled
 * for the dev server"; webpack's hot API without a `window` (Rsbuild's
 * server environment has no hot API): route-hmr-webpack-server-hosts.test.ts.
 *
 * The public Rsbuild plugin of React and the router plugin's Rspack entry,
 * added as an Rsbuild app adds it, through Rsbuild's JavaScript API
 * (`@tanstack/compiler-test-utils/rsbuild-plugin-host`); the router
 * plugin's own generator registers the route (a virtual route config). The
 * page runs in a run page of the test process; the server environment loads
 * through Rsbuild's own `loadBundle`.
 */
import path from 'node:path'
import { pluginReact } from '@rsbuild/plugin-react'
import { describe, expect, it, onTestFinished } from 'vitest'
import { createRsbuildPluginHost } from '@tanstack/compiler-test-utils/rsbuild-plugin-host'
import { tanstackRouter } from '../../src/rspack'
import type { RsbuildConfig, RsbuildPlugin } from '@rsbuild/core'

const timeout = 60_000

const posts = `function PostsComponent() {
  return <div>posts data</div>
}`

const routes = [
  {
    name: 'a split route',
    root: false,
    route: `import { createFileRoute } from '@tanstack/react-router'
${posts}
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: PostsComponent,
})`,
    html: '<div>posts data</div>',
  },
  {
    name: 'a root route',
    root: true,
    route: `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({
  loader: () => 'data',
  component: () => <div>root</div>,
})`,
    html: '<div>root</div>',
  },
]

/** What the modules see: the hot APIs and `window`. */
const environment = `export const environment = {
  hot: typeof import.meta.hot,
  webpackHot: typeof import.meta.webpackHot,
  window: typeof window,
}
`

/**
 * The client entry: loads the route's component (the router's `preload()`
 * of a split component), renders it with React's client renderer, and
 * reports it with the loader's value and what the modules see.
 */
const clientEntry = `import { createElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { Route } from '../route'
import { environment } from '../environment'
;(window as any).check = async () => {
  const component = (Route.options as any).component
  await component.preload?.()
  const el = document.createElement('div')
  document.body.append(el)
  const root = createRoot(el)
  flushSync(() => root.render(createElement(component)))
  return { data: await (Route.options as any).loader(), html: el.innerHTML, environment }
}
`

/** The server entry: the same, with React's server renderer. */
const serverEntry = `import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { Route } from '../route'
import { environment } from '../environment'
export async function check() {
  const component = (Route.options as any).component
  await component.preload?.()
  return {
    data: await (Route.options as any).loader(),
    html: renderToString(createElement(component)),
    environment,
  }
}
`

async function host(options: {
  route: string
  root: boolean
  style: 'webpack' | 'vite'
  hmr: boolean
}) {
  const routerPlugin = (root: string): RsbuildPlugin => ({
    name: 'app:tanstack-router',
    setup(api) {
      api.modifyRspackConfig((config) => {
        config.plugins.push(
          tanstackRouter({
            target: 'react',
            routesDirectory: root,
            generatedRouteTree: path.join(root, 'routeTree.gen.ts'),
            tmpDir: path.join(root, '.tanstack/tmp'),
            disableLogging: true,
            virtualRouteConfig: options.root
              ? { type: 'root', file: 'route.tsx', children: [] }
              : {
                  type: 'root',
                  file: '__root.tsx',
                  children: [{ type: 'index', file: 'route.tsx' }],
                },
            autoCodeSplitting: true,
            codeSplittingOptions: { addHmr: true },
            plugin: { hmr: { style: options.style } },
          }),
        )
      })
    },
  })
  const config: RsbuildConfig = {
    dev: { hmr: options.hmr, liveReload: options.hmr },
    environments: {
      web: { source: { entry: { index: './src/entry.tsx' } } },
      node: {
        source: { entry: { index: './src/server.tsx' } },
        // CommonJS: Rsbuild's `loadBundle` runs an ES module bundle only
        // with Node's `--experimental-vm-modules`
        output: { target: 'node', module: false },
      },
    },
  }
  return createRsbuildPluginHost({
    dir: path.dirname(import.meta.dirname),
    prefix: '.route-hmr-rsbuild-',
    registerCleanup: onTestFinished,
    entry: 'src/entry.tsx',
    files: {
      ...(options.root
        ? {}
        : {
            '__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({})
`,
          }),
      'route.tsx': options.route,
      'environment.ts': environment,
      'src/entry.tsx': clientEntry,
      'src/server.tsx': serverEntry,
    },
    plugins: ({ root }) => [pluginReact(), routerPlugin(root)],
    config,
    client: true,
  })
}

const hosts = [
  {
    name: 'a page with webpack hot API (webpack style)',
    side: 'page',
    style: 'webpack',
    hmr: true,
    environment: { hot: 'undefined', webpackHot: 'object', window: 'object' },
  },
  {
    name: 'the server environment (no window; webpack style)',
    side: 'server',
    style: 'webpack',
    hmr: true,
    environment: {
      hot: 'undefined',
      webpackHot: 'undefined',
      window: 'undefined',
    },
  },
  {
    name: 'a page of a dev server without HMR (no hot API, window; vite style)',
    side: 'page',
    style: 'vite',
    hmr: false,
    environment: {
      hot: 'undefined',
      webpackHot: 'undefined',
      window: 'object',
    },
  },
] as const

describe.each(routes)('$name', ({ route, root, html }) => {
  it.each(hosts)(
    'renders and loads in $name',
    async ({ side, style, hmr, environment: seen }) => {
      const app = await host({ route, root, style, hmr })
      const result =
        side === 'page'
          ? (await app.runClient('return window.check()')).result
          : await (
              await app.loadServer<{ check: () => Promise<unknown> }>('node')
            ).check()
      expect(result).toEqual({ data: 'data', html, environment: seen })
    },
    timeout,
  )
})
