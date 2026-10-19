/**
 * Rsbuild dev-server harness of the Start compiler: an Rsbuild dev server
 * with the Start compiler's Rsbuild transforms (`client` environment) on a
 * temporary app, through the shared Rsbuild dev-server harness
 * (`@tanstack/compiler-test-utils/rsbuild-dev-server`).
 * `@tanstack/react-start` is the real package (`startRuntimeLinks` of the
 * build harness). With `importProtection`, Start's Rsbuild import protection
 * also runs on the `client` environment. `runRsbuildClient()` runs the
 * emitted client code in a VM context with a browser's web APIs. The
 * temporary apps live in this directory.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { createRsbuildDevServer } from '@tanstack/compiler-test-utils/rsbuild-dev-server'
import { workspacePackageLinks } from '@tanstack/compiler-test-utils/workspace-packages'
import { onTestFinished } from 'vitest'
import { registerImportProtection } from '../src/rsbuild/import-protection'
import { registerStartCompilerTransforms } from '../src/rsbuild/start-compiler-host'
import { tanStackStartRsbuild } from '../src/rsbuild/plugin'
import { startRuntimeLinks } from './build-harness'
import { testLoaderFiles, useTestLoaders } from './rsbuild-test-loaders'
import type { ImportProtectionOptions } from '../src/schema'
import type { TanStackStartRsbuildInputConfig } from '../src/rsbuild/schema'
import type { GenerateFunctionIdFnOptional } from '../src/start-compiler/types'
import type { StartCompilerImportTransform } from '../src/types'
import type {
  RsbuildDevServer,
  RsbuildDevServerOptions,
} from '@tanstack/compiler-test-utils/rsbuild-dev-server'

const harnessDir = path.dirname(fileURLToPath(import.meta.url))
/**
 * Web APIs of a browser that Node.js has too (the WinterTC minimum common
 * API): a VM context has only the language's globals, and Start's client
 * runtime uses these (e.g. `TextDecoder` when its module loads).
 */
const webApis = [
  'AbortController',
  'AbortSignal',
  'Blob',
  'BroadcastChannel',
  'ByteLengthQueuingStrategy',
  'CompressionStream',
  'CountQueuingStrategy',
  'Crypto',
  'CryptoKey',
  'CustomEvent',
  'DOMException',
  'DecompressionStream',
  'Event',
  'EventTarget',
  'File',
  'FormData',
  'Headers',
  'MessageChannel',
  'MessageEvent',
  'MessagePort',
  'ReadableByteStreamController',
  'ReadableStream',
  'ReadableStreamBYOBReader',
  'ReadableStreamBYOBRequest',
  'ReadableStreamDefaultController',
  'ReadableStreamDefaultReader',
  'Request',
  'Response',
  'SubtleCrypto',
  'TextDecoder',
  'TextDecoderStream',
  'TextEncoder',
  'TextEncoderStream',
  'TransformStream',
  'TransformStreamDefaultController',
  'URL',
  'URLSearchParams',
  'WritableStream',
  'WritableStreamDefaultController',
  'WritableStreamDefaultWriter',
  'atob',
  'btoa',
  'clearInterval',
  'clearTimeout',
  'crypto',
  'fetch',
  'navigator',
  'performance',
  'queueMicrotask',
  'setInterval',
  'setTimeout',
  'structuredClone',
]

/** The `webApis` of this process, for a VM context. */
export function webGlobals(): Record<string, unknown> {
  return Object.fromEntries(
    webApis.map((name) => [
      name,
      (globalThis as Record<string, unknown>)[name],
    ]),
  )
}

/**
 * Starts an Rsbuild dev server with the Start compiler on an app of `files`
 * (entry `src/entry.ts`), and with import protection configured by
 * `importProtection` when given (source directory `src`).
 */
export function startRsbuildDevServer(
  options: Omit<RsbuildDevServerOptions, 'dir' | 'plugins'> & {
    importProtection?: ImportProtectionOptions
    /** Start's `serverFns.generateFunctionId` option. */
    generateFunctionId?: GenerateFunctionIdFnOptional
  },
): Promise<RsbuildDevServer> {
  const { files, importProtection, generateFunctionId, ...devServerOptions } =
    options
  return createRsbuildDevServer({
    dir: harnessDir,
    prefix: '.start-rsbuild-dev-server-',
    registerCleanup: onTestFinished,
    ...devServerOptions,
    config: {
      environments: { client: {} },
      // The server fn base Start's plugin defines, which Start's client
      // runtime reads (the compiler alone defines nothing).
      source: {
        define: {
          'process.env.TSS_SERVER_FN_BASE': JSON.stringify('/_serverFn/'),
        },
      },
      ...devServerOptions.config,
    },
    symlinks: { ...startRuntimeLinks(), ...devServerOptions.symlinks },
    files: {
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
            generateFunctionId,
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
 * Starts an Rsbuild dev server with Start's whole Rsbuild plugin
 * (`tanStackStartRsbuild`, with the options `@tanstack/react-start` passes):
 * client and SSR environments, SSR as the server fn provider, and the
 * generated server fn resolver. Both entries import `src/entry.ts`; the
 * server entry also imports the server fn resolver, as Start's server
 * handler does. `src/router.ts` and `src/routes/__root.tsx` are stubs unless
 * the app has them. With `framework: 'solid'`, Start's plugin gets the
 * Solid framework and the built `@tanstack/solid-start` and
 * `@tanstack/solid-router` are linked (Solid's JSX plugins come from
 * `config`).
 */
export function startRsbuildStartDevServer(
  options: Omit<RsbuildDevServerOptions, 'dir' | 'plugins'> & {
    /**
     * External import transforms of the Start compiler, which a framework
     * package passes to Start's plugin (e.g. React's RSC CSS transform).
     */
    compilerTransforms?: Array<StartCompilerImportTransform>
    /** The app's Start options (`tanStackStart(options)`). */
    start?: TanStackStartRsbuildInputConfig
    /** The Start framework package of the app (default `react`). */
    framework?: 'react' | 'solid'
  },
): Promise<RsbuildDevServer> {
  const {
    files,
    compilerTransforms,
    start,
    framework = 'react',
    ...devServerOptions
  } = options
  return createRsbuildDevServer({
    dir: harnessDir,
    prefix: '.start-rsbuild-start-dev-server-',
    registerCleanup: onTestFinished,
    ...devServerOptions,
    symlinks: {
      ...startRuntimeLinks(),
      ...(framework === 'solid' &&
        workspacePackageLinks([
          '@tanstack/solid-start',
          '@tanstack/solid-router',
        ])),
      ...devServerOptions.symlinks,
    },
    files: {
      ...testLoaderFiles,
      'harness/client-entry.ts': `import '../src/entry'\n`,
      'harness/server-entry.ts': `import '../src/entry'
import { getServerFnById } from '#tanstack-start-server-fn-resolver'
export default { getServerFnById }
`,
      'harness/start.ts': `export const startInstance = undefined\n`,
      'src/router.ts': `export const getRouter = () => undefined\n`,
      'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()
`,
      ...files,
    },
    plugins: ({ root }) => [
      tanStackStartRsbuild(
        {
          framework,
          defaultEntryPaths: {
            client: path.join(root, 'harness/client-entry.ts'),
            server: path.join(root, 'harness/server-entry.ts'),
            start: path.join(root, 'harness/start.ts'),
          },
          providerEnvironmentName: 'ssr',
          ssrIsProvider: true,
          compilerTransforms,
        },
        start,
      ),
      useTestLoaders(root),
    ],
  })
}

/**
 * Runs the JavaScript the dev server's `client` environment emitted, like a
 * browser loading the page (in a fresh VM context), then `script` (the body
 * of an async function) in the same context. Returns what the script
 * returns (`result`), or the message of what it throws (`error`). (A
 * script must not await an import-protection mock: the mock is a thenable
 * that resolves to itself, which blocks the process.)
 */
export async function runInClient(
  server: Pick<RsbuildDevServer, 'outputs'>,
  script: string,
): Promise<{ result: unknown } | { error: string }> {
  const context = vm.createContext({ ...webGlobals(), console: { ...console } })
  context.self = context
  context.window = context
  context.globalThis = context
  for (const code of Object.values(await server.outputs('client'))) {
    vm.runInContext(code, context)
  }
  try {
    const run = vm.runInContext(
      `(async () => {\n${script}\n})`,
      context,
    ) as () => Promise<unknown>
    return { result: await run() }
  } catch (error) {
    // errors of the VM context are not `instanceof Error` here
    return {
      error:
        typeof error === 'object' && error !== null && 'message' in error
          ? String(error.message)
          : String(error),
    }
  }
}

/**
 * Runs the JavaScript the dev server's client environment emitted, like a
 * browser loading the page (in a fresh VM context). Returns what it logged
 * to the console, one message per call (`Error`s by their message), each
 * prefixed with its console method (`warn: ...`) when `options.levels`.
 */
export async function runRsbuildClient(
  server: Pick<RsbuildDevServer, 'outputs'>,
  options: { levels?: boolean } = {},
): Promise<Array<string>> {
  const messages: Array<string> = []
  const recorder =
    (level: string) =>
    (...args: Array<unknown>) => {
      messages.push(
        (options.levels ? `${level}: ` : '') +
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
    ...webGlobals(),
    console: {
      log: recorder('log'),
      info: recorder('info'),
      warn: recorder('warn'),
      error: recorder('error'),
    },
  })
  context.self = context
  context.window = context
  context.globalThis = context
  for (const code of Object.values(await server.outputs())) {
    vm.runInContext(code, context)
  }
  return messages
}
