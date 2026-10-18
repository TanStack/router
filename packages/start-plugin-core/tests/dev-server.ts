/**
 * Dev-server harness of the Start compiler: a Vite dev server with the Start
 * compiler's Vite plugin (client and SSR environments, SSR as the server fn
 * provider) on a temporary app, through the shared dev-server harness
 * (`@tanstack/compiler-test-utils/dev-server`). `@tanstack/react-start` is the
 * real package (`startRuntimeLinks`). The temporary apps live in this
 * directory.
 *
 * With `start`, the dev server mounts Start's whole Vite plugin instead
 * (`tanStackStartVite`, with the options `@tanstack/react-start` passes), so
 * its dev server hooks, router generator, route tree client plugin and start
 * manifest run too.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDevServer } from '@tanstack/compiler-test-utils/dev-server'
import { onTestFinished } from 'vitest'
import { startCompilerPlugin } from '../src/vite/start-compiler-plugin/plugin'
import { tanStackStartVite } from '../src/vite/plugin'
import {
  reactStartPackage,
  routerRuntimeFiles,
  startRuntimeLinks,
} from './build-harness'
import { createClientRpc, startClientCore } from './start-runtime'
import type { ModuleStub } from '@tanstack/compiler-test-utils/module-linker'
import type { StartCompilerPluginOptions } from '../src/vite/start-compiler-plugin/plugin'
import type { TanStackStartInputConfig } from '../src/schema'
import type { StartCompilerImportTransform } from '../src/types'
import type { PluginOption } from 'vite'
import type {
  DevServer,
  DevServerOptions,
} from '@tanstack/compiler-test-utils/dev-server'

const harnessDir = path.dirname(fileURLToPath(import.meta.url))

/**
 * Start's real client runtime for evaluating served client modules
 * (`evaluateServed(server, url, { stubs: servedStartRuntime })`): the
 * entries of `@tanstack/react-start` a dev server serves to the client
 * (`/@fs/<package>/dist/esm/...`), loaded by Node (start-runtime.ts)
 * instead of from the dev server. The root entry imports React, which is
 * CommonJS: a browser gets it from Vite's dependency optimizer, which the
 * harness turns off.
 */
export const servedStartRuntime: Record<string, ModuleStub> = {
  [`/@fs${reactStartPackage}/dist/esm/index.js`]: startClientCore,
  [`/@fs${reactStartPackage}/dist/esm/client-rpc.js`]: { createClientRpc },
}

export interface StartDevServerOptions extends Omit<
  DevServerOptions,
  'dir' | 'plugins'
> {
  /**
   * Other Start Vite plugins (e.g. import protection), placed after the
   * Start compiler plugin like in the Start plugin, or a function of the app
   * root returning them.
   */
  plugins?:
    | Array<PluginOption>
    | ((app: { root: string }) => Array<PluginOption>)
  /**
   * The environments the Start compiler compiles (default `client`, and
   * `ssr` as a server environment), as a framework passes them (a server
   * environment other than the provider names its `getServerFnById`
   * module). Environments other than `client` and `ssr` are created as
   * server environments.
   */
  environments?: StartCompilerPluginOptions['environments']
  /** The server fn provider environment (default `ssr`). */
  providerEnvName?: string
  /**
   * Mounts Start's whole Vite plugin with these Start plugin options
   * (`tanstackStart(options)`) instead of the compiler plugin alone (then
   * `environments` and `providerEnvName` do not apply: client and SSR, SSR
   * as the provider). `@tanstack/react-router` is the build harness's
   * stand-in (`routerRuntimeFiles`) unless `realRouter`; the app's client and server entries are
   * empty, and `src/router.ts` and `src/routes/__root.tsx` are stubs unless
   * the app has them.
   */
  start?: TanStackStartInputConfig
  /**
   * With `start`: external import transforms of the Start compiler, which a
   * framework package passes to Start's plugin (e.g. React's RSC CSS
   * transform).
   */
  compilerTransforms?: Array<StartCompilerImportTransform>
  /**
   * With `start`: the app imports the real `@tanstack/react-router` (a
   * devDependency of this package) instead of the build harness's stand-in,
   * e.g. to run in a browser page (`browser`). Default `false`.
   */
  realRouter?: boolean
}

/** The files the harness adds to an app with Start's plugin, unless it has them. */
const startPluginFiles = {
  'harness/client-entry.ts': `export {}\n`,
  'harness/server-entry.ts': `export {}\n`,
  'harness/start.ts': `export const startInstance = undefined\n`,
  'src/router.ts': `export const getRouter = () => undefined\n`,
  'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()
`,
}

/** Start's Vite plugin with the core options `@tanstack/react-start` passes. */
function startPlugin(
  root: string,
  start: TanStackStartInputConfig,
  compilerTransforms: Array<StartCompilerImportTransform> | undefined,
) {
  return tanStackStartVite(
    {
      framework: 'react',
      defaultEntryPaths: {
        client: path.join(root, 'harness/client-entry.ts'),
        server: path.join(root, 'harness/server-entry.ts'),
        start: path.join(root, 'harness/start.ts'),
      },
      providerEnvironmentName: 'ssr',
      ssrIsProvider: true,
      ssrResolverStrategy: { type: 'default' },
      compilerTransforms,
    },
    start,
  )
}

/** Starts a Vite dev server with the Start compiler on an app of `files`. */
export function startDevServer(
  options: StartDevServerOptions,
): Promise<DevServer> {
  const {
    files,
    plugins = [],
    environments = [
      { name: 'client', type: 'client' },
      { name: 'ssr', type: 'server' },
    ],
    providerEnvName = 'ssr',
    start,
    compilerTransforms,
    realRouter = false,
    ...devServerOptions
  } = options
  /** Server environments Vite does not create by default. */
  const extraEnvironments = environments
    .map((environment) => environment.name)
    .filter((name) => name !== 'client' && name !== 'ssr')
  return createDevServer({
    dir: harnessDir,
    prefix: '.start-dev-server-',
    registerCleanup: onTestFinished,
    ...devServerOptions,
    files: {
      ...(start && !realRouter && routerRuntimeFiles),
      ...(start && startPluginFiles),
      ...files,
    },
    symlinks: { ...startRuntimeLinks(files), ...devServerOptions.symlinks },
    plugins: ({ root }) => [
      start
        ? startPlugin(root, start, compilerTransforms)
        : startCompilerPlugin({
            framework: 'react',
            environments,
            providerEnvName,
          }),
      ...(typeof plugins === 'function' ? plugins({ root }) : plugins),
      {
        name: 'start-dev-server-harness',
        // Start's SSR RPC (`createSsrRpc`) imports the resolver virtual
        // module
        config: () => ({
          ssr: { noExternal: ['@tanstack/react-start'] },
          ...(extraEnvironments.length > 0 && {
            environments: Object.fromEntries(
              extraEnvironments.map((name) => [
                name,
                {
                  consumer: 'server' as const,
                  resolve: { noExternal: ['@tanstack/react-start'] },
                },
              ]),
            ),
          }),
        }),
      },
    ],
  })
}
