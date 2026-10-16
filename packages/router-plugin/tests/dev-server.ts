/**
 * Dev-server harness of the router plugin: a Vite dev server with the
 * router plugin (React, file-based routes in `routes/`, the route tree in
 * `routeTree.gen.ts`, code splitting on) on a temporary app, through the
 * shared dev-server harness (`@tanstack/compiler-test-utils/dev-server`). The
 * temporary apps live in this directory, so their imports resolve to this
 * package's dependencies.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDevServer } from '@tanstack/compiler-test-utils/dev-server'
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
   * Other Vite plugins, after the router plugin (e.g. a framework plugin or
   * a stub of a router package), or a function of the app root returning
   * them.
   */
  plugins?:
    | Array<PluginOption>
    | ((app: { root: string }) => Array<PluginOption>)
}

/**
 * A Vite plugin that serves a stub of the router package of `target` (the
 * real packages need their framework's runtime and a DOM): routes keep
 * their options (`{ options }`), and lazy
 * route options (`lazyRouteComponent`, `lazyFn`) call what their module
 * provides and have `load()`, which resolves to it.
 */
export function routerPackageStub(
  target: Config['target'] = 'react',
): PluginOption {
  const routerPackage = `@tanstack/${target}-router`
  const stubId = `\0${routerPackage}-stub`
  return {
    name: 'router-package-stub',
    enforce: 'pre',
    resolveId: (id) => (id === routerPackage ? stubId : undefined),
    load: (id) =>
      id === stubId
        ? `const route = (options) => ({ options })
export const createFileRoute = () => route
export const createRootRoute = route
const lazy = (importer, name) => {
  const load = async () => (await importer())[name]
  return Object.assign(async (...args) => (await load())(...args), { load })
}
export const lazyRouteComponent = (importer, name = 'default') => lazy(importer, name)
export const lazyFn = (importer, name = 'default') => lazy(importer, name)`
        : undefined,
  }
}

/**
 * The value of a route option of a route module served with
 * `routerPackageStub`, once its lazy module (if any) loaded.
 */
export function loadRouteOption(value: any): Promise<unknown> {
  return typeof value?.load === 'function'
    ? value.load()
    : Promise.resolve(value)
}

/**
 * Starts a dev server (`routerPackageStub` for the router package) on
 * `routes/page.tsx` holding `route` and imports the route module in the SSR
 * environment.
 */
export async function importRouteModule(
  route: string,
  pluginOptions: Partial<Config> = {},
) {
  const server = await routerDevServer({
    pluginOptions,
    plugins: [routerPackageStub(pluginOptions.target)],
    files: { 'routes/page.tsx': route },
  })
  return server.import('/routes/page.tsx')
}

/**
 * Serves `route` as `routes/page.tsx` (`importRouteModule`, with React HMR,
 * `autoCodeSplitting` and the component and the loader in their own chunks)
 * and asserts that each export named in `exported` is the value of the given
 * route options, once loaded.
 */
export async function expectExportedRouteOptions(
  route: string,
  exported: Record<string, Array<string>>,
  autoCodeSplitting: boolean,
) {
  const routeModule = await importRouteModule(route, {
    autoCodeSplitting,
    codeSplittingOptions: { defaultBehavior: [['component'], ['loader']] },
  })
  for (const [name, keys] of Object.entries(exported)) {
    expect(routeModule).toHaveProperty(name)
    for (const key of keys) {
      expect(routeModule[name], `${name} is the ${key} option`).toBe(
        await loadRouteOption(routeModule.Route.options[key]),
      )
    }
  }
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
  const routeModule = await importRouteModule(
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
 * router package).
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
