/**
 * Dev-server harness of the router plugin: a Vite dev server with the
 * router plugin (React, file-based routes in `routes/`, the route tree in
 * `routeTree.gen.ts`, code splitting on) on a temporary app, through the
 * shared dev-server harness (`@tanstack/compiler-test-utils/dev-server`). The
 * temporary apps live in this directory, so their imports resolve to this
 * package's dependencies: the real router packages, React, Solid and Vue.
 *
 * Its server-side helpers (`renderRoutePath`, `import` of the SSR
 * environment) judge server semantics. Client semantics of route module
 * exports (`expectExportedRouteOptions`, `expectSharedOverloads`) run in a
 * real page through `route-app.ts`.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDevServer } from '@tanstack/compiler-test-utils/dev-server'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { expect } from 'vitest'
import { onTestFinished } from '@tanstack/compiler-test-utils/test-scope'
import { tanstackRouter } from '../src/vite'
import { loadRoute } from './route-app'
import type {
  DevServer,
  DevServerOptions,
} from '@tanstack/compiler-test-utils/dev-server'
import type { PluginOption } from 'vite'
import type { Config } from '../src'

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
 * A module of the app importing the route module's exports (`bindings`:
 * its namespace), as another module of an app does.
 */
export const exportsImporter = `import * as route from './route'
export const bindings = route
`

/**
 * The TypeScript settings of the apps of `routerDevServer` (TypeScript's
 * defaults, `isolatedModules`: without `verbatimModuleSyntax`, the
 * transform drops imports that only types read), for route apps standing in
 * for them.
 */
export const appTsconfig = {
  verbatimModuleSyntax: false,
  isolatedModules: true,
}

/**
 * Loads `route` (route id `/page`) with React HMR and `autoCodeSplitting`
 * (the component and the loader in their own chunks) next to a module that
 * imports the route module's exports (`importer.ts`), in a real page
 * (`route-app.ts`), and asserts that each imported export named in
 * `exported` is a component the given route options render as: its body
 * reports its own identity through a separate module (`see.ts`), including
 * behind a lazy wrapper; the page at `/page` renders the route's component
 * through the real router.
 */
export async function expectExportedRouteOptions(
  route: string,
  exported: Record<string, Array<string>>,
  autoCodeSplitting: boolean,
) {
  const app = await loadRoute(`import { see } from './see'\n${route}`, {
    routeId: '/page',
    hmr: true,
    tsconfig: appTsconfig,
    pluginOptions: {
      autoCodeSplitting,
      codeSplittingOptions: { defaultBehavior: [['component'], ['loader']] },
    },
    files: {
      'see.ts': `export const seen: Array<unknown> = []
export function see(component: unknown) { seen.push(component) }`,
      'importer.ts': exportsImporter,
    },
  })
  const result = await app.run<{
    exports: Record<
      string,
      {
        type: string
        rendered: string | null
        options: Record<string, { html: string; sees: boolean }>
      }
    >
    page: string
    component: string
  }>(`const { bindings } = await app('importer.ts')
const { seen } = await app('see.ts')
const out = {}
for (const [name, keys] of Object.entries(${JSON.stringify(exported)})) {
  const value = bindings[name]
  const entry = { type: typeof value, rendered: null, options: {} }
  if (typeof value === 'function') entry.rendered = await renderComponent(value)
  for (const key of keys) {
    const option = await load(key)
    seen.length = 0
    const html = await renderComponent(option)
    // The rendered body reports its own binding across an opaque module
    // boundary: equal HTML alone cannot detect a copied function or class
    entry.options[key] = { html, sees: seen.includes(value) }
  }
  out[name] = entry
}
return { exports: out, page: await renderRoute({ at: '/page' }), component: await render('component') }`)
  for (const [name, keys] of Object.entries(exported)) {
    const entry = result.exports[name]!
    expect(entry.type, `${name} is a component`).toBe('function')
    expect(entry.rendered, `${name} renders`).not.toBe('')
    for (const key of keys) {
      expect(entry.options[key]!.html, `${key} renders as ${name}`).toBe(
        entry.rendered,
      )
      expect(
        entry.options[key]!.sees,
        `${key} renders the imported ${name} instance`,
      ).toBe(true)
    }
  }
  expect(result.page).toContain(result.component)
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
export class component extends Component { render() { see(component); return <p>class</p> } }`,
      options: 'component',
      exported: { component: ['component'] },
    },
    {
      name: 'aliased',
      declaration:
        'function component() { see(component); return <p>aliased</p> }; export { component as View }',
      options: 'component',
      exported: { View: ['component'] },
    },
  ]

/**
 * Loads a route whose `beforeLoad` and split `loader` call an exported,
 * overloaded and aliased function, next to a module importing the route
 * module's exports, in a real page (`route-app.ts`), and asserts that the
 * imported function and alias are the same working function, and that both
 * options keep working.
 */
export async function expectSharedOverloads(autoCodeSplitting: boolean) {
  const app = await loadRoute(
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
      routeId: '/page',
      hmr: true,
      tsconfig: appTsconfig,
      pluginOptions: {
        autoCodeSplitting,
        codeSplittingOptions: { defaultBehavior: [['component'], ['loader']] },
      },
      files: { 'importer.ts': exportsImporter },
    },
  )
  expect(
    await app.run(`const { bindings } = await app('importer.ts')
return [
  bindings.helper('imported'),
  bindings.helperAlias === bindings.helper,
  bindings.Route.options.beforeLoad(),
  await bindings.Route.options.loader(),
]`),
  ).toEqual(['imported', true, 'before', 42])
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
