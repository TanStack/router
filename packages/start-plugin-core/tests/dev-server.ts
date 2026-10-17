/**
 * Dev-server harness of the Start compiler: a Vite dev server with the Start
 * compiler's Vite plugin (client and SSR environments, SSR as the server fn
 * provider) on a temporary app, through the shared dev-server harness
 * (`@tanstack/compiler-test-utils/dev-server`). `@tanstack/react-start` is the
 * stand-in package of the build harness (`startRuntimeFiles`). The temporary
 * apps live in this directory.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDevServer } from '@tanstack/compiler-test-utils/dev-server'
import { onTestFinished } from 'vitest'
import { startCompilerPlugin } from '../src/vite/start-compiler-plugin/plugin'
import { startRuntimeFiles } from './build-harness'
import type { StartCompilerPluginOptions } from '../src/vite/start-compiler-plugin/plugin'
import type { PluginOption } from 'vite'
import type {
  DevServer,
  DevServerOptions,
} from '@tanstack/compiler-test-utils/dev-server'

const harnessDir = path.dirname(fileURLToPath(import.meta.url))

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
    files: { ...startRuntimeFiles, ...files },
    plugins: ({ root }) => [
      startCompilerPlugin({ framework: 'react', environments, providerEnvName }),
      ...(typeof plugins === 'function' ? plugins({ root }) : plugins),
      {
        name: 'start-dev-server-harness',
        // The stand-in package imports the resolver virtual module
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
