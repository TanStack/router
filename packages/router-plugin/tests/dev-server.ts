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
import { importerSource } from '@tanstack/compiler-test-utils/importers'
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

/**
 * Whether a URL a Vite dev server serves (an import specifier of a served
 * module) is a module of the app or one a plugin serves (`/@id/…`), whatever
 * its path or query (SPEC §5.3): not a dependency (pre-bundled in
 * `node_modules`, or a file outside the app root, `/@fs/…`), not Vite's
 * client or a refresh runtime.
 */
export function isServedAppModule(url: string) {
  return (
    url.startsWith('/') &&
    !/^\/@(?:vite|react-refresh|fs)\//.test(url) &&
    !/\/node_modules\//.test(url)
  )
}

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
 * Starts a dev server on `routes/page.tsx` holding `route`, with a second
 * module of the app, `importer.ts`, importing `names` from the route module
 * (`importerSource`: named, `default`), and imports that module in the SSR
 * environment, with the dev server (the route module resolves the real
 * router package of the target, a dependency of this package). Returns the
 * importer's live bindings: what a module importing the route file gets.
 */
export async function importFromRouteModule(
  route: string,
  names: Array<string>,
  pluginOptions: Partial<Config> = {},
) {
  const server = await routerDevServer({
    pluginOptions,
    files: {
      'routes/page.tsx': route,
      'importer.ts': importerSource('./routes/page', names),
    },
  })
  const { bindings } = await server.import('/importer.ts')
  return { server, imported: bindings as Record<string, any> }
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
    await server.vite.environments.client.pluginContainer.resolveId(
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
 * Serves `route` as `routes/page.tsx` (with React HMR, `autoCodeSplitting`
 * and the component and the loader in their own chunks) with a module that
 * imports the exports named in `exported` and the route
 * (`importFromRouteModule`), and asserts that each imported export is a
 * component the given route options render as: the option's value is the
 * imported component, or (a split option) renders the same HTML once
 * loaded; the page at `/page` renders the route's component through the
 * real router.
 */
export async function expectExportedRouteOptions(
  route: string,
  exported: Record<string, Array<string>>,
  autoCodeSplitting: boolean,
) {
  const { server, imported } = await importFromRouteModule(
    route,
    [...Object.keys(exported), 'Route'],
    {
      autoCodeSplitting,
      codeSplittingOptions: { defaultBehavior: [['component'], ['loader']] },
    },
  )
  const { Route } = imported
  for (const [name, keys] of Object.entries(exported)) {
    expect(imported[name], `${name} is a component`).toBeTypeOf('function')
    const rendered = await renderRouteComponent(imported[name])
    expect(rendered, `${name} renders`).not.toBe('')
    for (const key of keys) {
      const option = Route.options[key]
      if (option !== imported[name]) {
        expect(
          await renderRouteComponent(option),
          `${key} renders as ${name}`,
        ).toBe(rendered)
      }
    }
  }
  expect(await renderRoutePath(server, '/page')).toContain(
    await renderRouteComponent(Route.options.component),
  )
}

/**
 * A route file case of `expectExportedRouteOptions`: `declaration` declares
 * and exports components (each rendering something of its own), `options`
 * are the route options, and `exported` maps each export to the route
 * options whose value it is.
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
export class component extends Component { render() { return <p>class</p> } }`,
      options: 'component',
      exported: { component: ['component'] },
    },
    {
      name: 'aliased',
      declaration:
        'function component() { return <p>aliased</p> }; export { component as View }',
      options: 'component',
      exported: { View: ['component'] },
    },
  ]

/**
 * Serves a route whose `beforeLoad` and split `loader` call an exported,
 * overloaded and aliased function, with a module importing the function,
 * its alias and the route (`importFromRouteModule`), and asserts that the
 * imported function and alias are the same working function, and that both
 * options keep working.
 */
export async function expectSharedOverloads(autoCodeSplitting: boolean) {
  const { imported } = await importFromRouteModule(
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
    ['helper', 'helperAlias', 'Route'],
    {
      autoCodeSplitting,
      codeSplittingOptions: { defaultBehavior: [['component'], ['loader']] },
    },
  )
  expect(imported.helper('imported')).toBe('imported')
  expect(imported.helperAlias).toBe(imported.helper)
  expect(imported.Route.options.beforeLoad()).toBe('before')
  expect(await imported.Route.options.loader()).toBe(42)
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
