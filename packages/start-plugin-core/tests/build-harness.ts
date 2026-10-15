/**
 * Real-build harness for Start compiler goal tests whose outcome the bundler
 * decides (e.g. "server code never reaches the client bundle"). Builds an app
 * the way a Start build does, client first and then SSR, with the Start
 * compiler's Vite plugin, and describes and runs both outputs with the shared
 * build harness (`@tanstack/compiler-test-utils/build-harness`). The
 * temporary apps live in this directory.
 *
 * `@tanstack/react-start` is a minimal stand-in package written into the app
 * (`startRuntimeFiles`): server functions run their handler through the
 * generated server-function resolver, client RPCs throw when called.
 *
 * Vite only: the Rsbuild integration needs its compiler host and loaders.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from '@tanstack/compiler-test-utils/build-harness'
import { onTestFinished } from 'vitest'
import { startCompilerPlugin } from '../src/vite/start-compiler-plugin/plugin'
import type {
  AppOptions,
  BuildMode,
  BuildResult,
} from '@tanstack/compiler-test-utils/build-harness'

const startPackage = 'node_modules/@tanstack/react-start'

/** The stand-in `@tanstack/react-start` package. */
export const startRuntimeFiles: Record<string, string> = {
  [`${startPackage}/package.json`]: JSON.stringify({
    name: '@tanstack/react-start',
    type: 'module',
    sideEffects: false,
    exports: {
      '.': './index.js',
      './client-rpc': './client-rpc.js',
      './server-rpc': './server-rpc.js',
      './ssr-rpc': './ssr-rpc.js',
    },
  }),
  [`${startPackage}/index.js`]: `const uncompiled = (name) => () => {
  throw new Error('uncompiled Start factory: ' + name)
}
export function createServerFn() {
  const builder = {
    middleware: () => builder,
    inputValidator: () => builder,
    handler(rpc, impl) {
      if (!impl) {
        return rpc
      }
      const serverFn = (opts) => impl(opts ?? {})
      serverFn.__executeServer = (opts) => impl(opts ?? {})
      return serverFn
    },
  }
  return builder
}
export const createServerOnlyFn = uncompiled('createServerOnlyFn')
export const createClientOnlyFn = uncompiled('createClientOnlyFn')
export const createIsomorphicFn = uncompiled('createIsomorphicFn')
export const createMiddleware = uncompiled('createMiddleware')
`,
  [`${startPackage}/client-rpc.js`]: `export const createClientRpc = (id) =>
  Object.assign(
    () => {
      throw new Error('client RPC ' + id)
    },
    { functionId: id },
  )
`,
  [`${startPackage}/server-rpc.js`]: `export const createServerRpc = (meta, fn) => Object.assign(fn, { meta })
`,
  [`${startPackage}/ssr-rpc.js`]: `import { getServerFnById } from '#tanstack-start-server-fn-resolver'
export const createSsrRpc = (id) => async (opts) =>
  (await getServerFnById(id, { origin: 'server' }))(opts ?? {})
`,
}

const harnessDir = path.dirname(fileURLToPath(import.meta.url))

export interface StartBuildOptions extends Omit<AppOptions, 'dir'> {
  /** Entry module of both builds, relative to the app root (default `entry.ts`). */
  entry?: string
  mode?: BuildMode
  minify?: boolean
}

/**
 * Builds the app for the client (`dist/client`) and then for SSR
 * (`dist/ssr`) with one Start compiler plugin, as a Start build does, so the
 * SSR build sees the server functions the client build found.
 */
export async function buildStart(
  options: StartBuildOptions,
): Promise<{ client: BuildResult; ssr: BuildResult }> {
  const { entry, mode, minify, files, ...appOptions } = options
  const app = await createApp({
    dir: harnessDir,
    prefix: '.start-build-harness-',
    ...appOptions,
    files: { ...startRuntimeFiles, ...files },
  })
  onTestFinished(app.dispose)
  const plugins = [
    startCompilerPlugin({
      framework: 'react',
      environments: [
        { name: 'client', type: 'client' },
        { name: 'ssr', type: 'server' },
      ],
      providerEnvName: 'ssr',
    }),
    {
      name: 'start-build-harness',
      // The stand-in package imports the resolver virtual module
      config: () => ({ ssr: { noExternal: ['@tanstack/react-start'] } }),
    },
  ]
  const target = { bundler: 'vite', entry, mode, minify } as const
  const client = await app.bundle({
    ...target,
    env: 'client',
    outDir: 'dist/client',
    plugin: () => plugins,
  })
  const ssr = await app.bundle({
    ...target,
    env: 'ssr',
    outDir: 'dist/ssr',
    plugin: () => plugins,
  })
  return { client, ssr }
}
