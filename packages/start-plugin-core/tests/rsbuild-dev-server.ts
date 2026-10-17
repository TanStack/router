/**
 * Rsbuild dev-server harness of the Start compiler: an Rsbuild dev server
 * with the Start compiler's Rsbuild transforms (`client` environment) on a
 * temporary app, through the shared Rsbuild dev-server harness
 * (`@tanstack/compiler-test-utils/rsbuild-dev-server`).
 * `@tanstack/react-start` is the stand-in package of the build harness
 * (`startRuntimeFiles`). With `importProtection`, Start's Rsbuild import
 * protection also runs on the `client` environment. `runRsbuildClient()` runs
 * the emitted client code. The temporary apps live in this directory.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { createRsbuildDevServer } from '@tanstack/compiler-test-utils/rsbuild-dev-server'
import { onTestFinished } from 'vitest'
import { registerImportProtection } from '../src/rsbuild/import-protection'
import { registerStartCompilerTransforms } from '../src/rsbuild/start-compiler-host'
import { startRuntimeFiles } from './build-harness'
import { testLoaderFiles, useTestLoaders } from './rsbuild-test-loaders'
import type { ImportProtectionOptions } from '../src/schema'
import type {
  RsbuildDevServer,
  RsbuildDevServerOptions,
} from '@tanstack/compiler-test-utils/rsbuild-dev-server'

const harnessDir = path.dirname(fileURLToPath(import.meta.url))

/**
 * Starts an Rsbuild dev server with the Start compiler on an app of `files`
 * (entry `src/entry.ts`), and with import protection configured by
 * `importProtection` when given (source directory `src`).
 */
export function startRsbuildDevServer(
  options: Omit<RsbuildDevServerOptions, 'dir' | 'plugins'> & {
    importProtection?: ImportProtectionOptions
  },
): Promise<RsbuildDevServer> {
  const { files, importProtection, ...devServerOptions } = options
  return createRsbuildDevServer({
    dir: harnessDir,
    prefix: '.start-rsbuild-dev-server-',
    registerCleanup: onTestFinished,
    ...devServerOptions,
    config: { environments: { client: {} }, ...devServerOptions.config },
    files: {
      ...startRuntimeFiles,
      ...testLoaderFiles,
      ...files,
    },
    plugins: ({ root }) => [
      {
        name: 'start-compiler',
        setup(api) {
          registerStartCompilerTransforms(api, {
            framework: 'react',
            root,
            environments: [{ name: 'client', type: 'client' }],
            providerEnvName: 'ssr',
          })
          if (importProtection) {
            registerImportProtection(api, {
              framework: 'react',
              environments: [{ name: 'client', type: 'client' }],
              getConfig: () => ({
                startConfig: { importProtection },
                resolvedStartConfig: {
                  root,
                  srcDirectory: path.join(root, 'src'),
                },
              }),
            })
          }
        },
      },
      useTestLoaders(root),
    ],
  })
}

/**
 * Runs the JavaScript the dev server's client environment emitted, like a
 * browser loading the page (in a fresh VM context). Returns what it logged
 * to the console, one message per call (`Error`s by their message).
 */
export async function runRsbuildClient(
  server: Pick<RsbuildDevServer, 'outputs'>,
): Promise<Array<string>> {
  const messages: Array<string> = []
  const record = (...args: Array<unknown>) => {
    messages.push(
      args
        .map((arg) =>
          // errors of the VM context are not `instanceof Error` here
          typeof arg === 'object' && arg !== null && 'message' in arg
            ? String(arg.message)
            : String(arg),
        )
        .join(' '),
    )
  }
  const context = vm.createContext({
    console: { log: record, info: record, warn: record, error: record },
  })
  context.self = context
  context.globalThis = context
  for (const code of Object.values(await server.outputs())) {
    vm.runInContext(code, context)
  }
  return messages
}
