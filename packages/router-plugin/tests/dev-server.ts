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
import { onTestFinished } from 'vitest'
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
