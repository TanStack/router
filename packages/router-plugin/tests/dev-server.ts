/**
 * Dev-server harness of the router plugin: a Vite dev server with the
 * router plugin (React, file-based routes in `routes/`, the route tree in
 * `routeTree.gen.ts`, code splitting on) on a temporary app, through the
 * shared dev-server harness (`@tanstack/compiler-test-utils/dev-server`). The
 * temporary apps live in this directory, so their imports resolve to this
 * package's dependencies: the real router packages, React, Solid and Vue.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDevServer } from '@tanstack/compiler-test-utils/dev-server'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { expect, onTestFinished } from 'vitest'
import { tanstackRouter } from '../src/vite'
import type {
  DevServer,
  DevServerOptions,
} from '@tanstack/compiler-test-utils/dev-server'
import type { PluginOption } from 'vite'
import type { Config } from '../src/core/config'

const harnessDir = path.dirname(fileURLToPath(import.meta.url))

/** An empty root route of the router package of `target`. */
export function rootRouteOf(target: Config['target'] = 'react') {
  return `import { createRootRoute } from '@tanstack/${target}-router'
export const Route = createRootRoute({})
`
}

export const rootRoute = rootRouteOf('react')

export interface RouterDevServerOptions extends Omit<
  DevServerOptions,
  'dir' | 'plugins'
> {
  /**
   * Router plugin options over the harness defaults (e.g. `target`); `null`
   * starts the server without the plugin options of the harness (e.g. to
   * read them from `tsr.config.json`).
   */
  pluginOptions?: Partial<Config> | null
  /**
   * Other Vite plugins, after the router plugin (e.g. a framework plugin),
   * or a function of the app root returning them.
   */
  plugins?:
    | Array<PluginOption>
    | ((app: { root: string }) => Array<PluginOption>)
}

/**
 * Starts a dev server on `routes/page.tsx` holding `route` and imports the
 * route module in the SSR environment, with the dev server (the route module
 * resolves the real router package of the target, a dependency of this
 * package).
 */
export async function importRouteModule(
  route: string,
  pluginOptions: Partial<Config> = {},
) {
  const server = await routerDevServer({
    pluginOptions,
    files: { 'routes/page.tsx': route },
  })
  return { server, routeModule: await server.import('/routes/page.tsx') }
}

/**
 * Renders the app's generated route tree (`routeTree.gen.ts`) at `pathname`
 * through the real router and React, in the SSR environment of `server`:
 * `createRouter` over the tree, `router.load()` (which runs the loaders and
 * loads the split route options), then `<RouterProvider>` to HTML. React
 * targets only. (The router package is the one the served modules use: the
 * SSR environment's; React and its server renderer are this process's, as
 * the SSR environment loads them from Node too.)
 */
export async function renderRoutePath(
  server: Pick<DevServer, 'import'>,
  pathname: string,
): Promise<string> {
  const { routeTree } = await server.import('/routeTree.gen.ts')
  const { RouterProvider, createMemoryHistory, createRouter } =
    await server.import('@tanstack/react-router')
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [pathname] }),
  })
  await router.load()
  return renderToString(createElement(RouterProvider, { router }))
}

/**
 * The URL `server` serves the router package of `target` at in the client
 * environment (the built workspace package, outside the app root, which
 * Vite's resolver picks with its development condition): the key of a stub
 * of it for `evaluateServed`, e.g. the same package loaded in the SSR
 * environment (`server.import('@tanstack/react-router')`).
 */
export async function servedRouterPackageUrl(
  server: Pick<DevServer, 'vite' | 'root'>,
  target: Config['target'] = 'react',
): Promise<string> {
  const resolved =
    await server.vite.environments.client!.pluginContainer.resolveId(
      `@tanstack/${target}-router`,
      path.join(server.root, 'routes/__root.tsx'),
    )
  if (!resolved) {
    throw new Error(`@tanstack/${target}-router does not resolve from the app`)
  }
  return `/@fs${resolved.id}`
}

/**
 * Renders a React component option of a served route module (loaded first,
 * when the code splitter made it lazy: `preload()` of the real router's lazy
 * route component) to HTML with React, like a route render does.
 */
export async function renderRouteComponent(component: any): Promise<string> {
  await component.preload?.()
  return renderToString(createElement(component))
}

/**
 * Serves `route` as `routes/page.tsx` (`importRouteModule`, with React HMR,
 * `autoCodeSplitting` and the component and the loader in their own chunks)
 * and asserts that each export named in `exported` is a component the given
 * route options render as: the export is the option's value, or (a split
 * option) the real router's lazy component of it, rendering the same HTML
 * once loaded; the page at `/page` renders through the real router.
 */
export async function expectExportedRouteOptions(
  route: string,
  exported: Record<string, Array<string>>,
  autoCodeSplitting: boolean,
) {
  const { server, routeModule } = await importRouteModule(route, {
    autoCodeSplitting,
    codeSplittingOptions: { defaultBehavior: [['component'], ['loader']] },
  })
  for (const [name, keys] of Object.entries(exported)) {
    expect(routeModule).toHaveProperty(name)
    expect(routeModule[name], `${name} is a component`).toBeTypeOf('function')
    const rendered = await renderRouteComponent(routeModule[name])
    for (const key of keys) {
      const option = routeModule.Route.options[key]
      if (option !== routeModule[name]) {
        expect(option, `${key} is the lazy ${name}`).toHaveProperty('preload')
        expect(
          await renderRouteComponent(option),
          `${key} renders as ${name}`,
        ).toBe(rendered)
      }
    }
  }
  expect(await renderRoutePath(server, '/page')).toContain(
    await renderRouteComponent(routeModule.Route.options.component),
  )
}

/**
 * A route file case of `expectExportedRouteOptions`: `declaration` declares
 * and exports components, `options` are the route options, and `exported`
 * maps each export to the route options whose value it is.
 */
export type ExportedRouteOptionsCase = {
  name: string
  declaration: string
  options: string
  exported: Record<string, Array<string>>
}

/**
 * Exported route components that a route module loses when the component is
 * split (pinned in known-bugs-dev-server.test.ts), for
 * `expectExportedRouteOptions`.
 */
export const exportedComponentsLostWhenSplit: Array<ExportedRouteOptionsCase> =
  [
    {
      name: 'class',
      declaration: `import { Component } from 'react'
export class component extends Component { render() { return null } }`,
      options: 'component',
      exported: { component: ['component'] },
    },
    {
      name: 'aliased',
      declaration:
        'function component() { return null }; export { component as View }',
      options: 'component',
      exported: { View: ['component'] },
    },
  ]

/**
 * Serves a route whose `beforeLoad` and split `loader` call an exported,
 * overloaded and aliased function, and asserts that the exports and both
 * options keep working.
 */
export async function expectSharedOverloads(autoCodeSplitting: boolean) {
  const { routeModule } = await importRouteModule(
    `import { createFileRoute } from '@tanstack/react-router'
export function helper(value: string): string
export function helper(value: number): number
export function helper(value: string | number) { return value }
export { helper as helperAlias }
export const Route = createFileRoute('/page')({
  component: () => null,
  beforeLoad: () => helper('before'),
  loader: () => helper(42),
})`,
    {
      autoCodeSplitting,
      codeSplittingOptions: { defaultBehavior: [['component'], ['loader']] },
    },
  )
  expect(routeModule.helperAlias).toBe(routeModule.helper)
  expect(routeModule.Route.options.beforeLoad()).toBe('before')
  expect(await routeModule.Route.options.loader()).toBe(42)
}

/**
 * Starts a Vite dev server with the router plugin on an app of `files`
 * (`routes/__root.tsx` defaults to an empty root route of the target's
 * router package). The app resolves the real router packages
 * (`@tanstack/{react,solid,vue}-router`, dependencies of this package).
 */
export function routerDevServer(
  options: RouterDevServerOptions,
): Promise<DevServer> {
  const {
    files,
    pluginOptions = {},
    plugins = [],
    ...devServerOptions
  } = options
  return createDevServer({
    dir: harnessDir,
    prefix: '.router-dev-server-',
    registerCleanup: onTestFinished,
    ...devServerOptions,
    files: {
      'routes/__root.tsx': rootRouteOf(pluginOptions?.target),
      ...files,
    },
    plugins: (app) => [
      tanstackRouter(
        pluginOptions === null
          ? {}
          : {
              target: 'react',
              routesDirectory: './routes',
              generatedRouteTree: './routeTree.gen.ts',
              autoCodeSplitting: true,
              ...pluginOptions,
            },
      ),
      ...(typeof plugins === 'function' ? plugins(app) : plugins),
    ],
  })
}
