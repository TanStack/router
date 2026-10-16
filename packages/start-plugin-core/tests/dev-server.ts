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
}

/** Starts a Vite dev server with the Start compiler on an app of `files`. */
export function startDevServer(
  options: StartDevServerOptions,
): Promise<DevServer> {
  const { files, plugins = [], ...devServerOptions } = options
  return createDevServer({
    dir: harnessDir,
    prefix: '.start-dev-server-',
    registerCleanup: onTestFinished,
    ...devServerOptions,
    files: { ...startRuntimeFiles, ...files },
    plugins: ({ root }) => [
      startCompilerPlugin({
        framework: 'react',
        environments: [
          { name: 'client', type: 'client' },
          { name: 'ssr', type: 'server' },
        ],
        providerEnvName: 'ssr',
      }),
      ...(typeof plugins === 'function' ? plugins({ root }) : plugins),
      {
        name: 'start-dev-server-harness',
        // The stand-in package imports the resolver virtual module
        config: () => ({ ssr: { noExternal: ['@tanstack/react-start'] } }),
      },
    ],
  })
}
