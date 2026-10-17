/**
 * Helpers of the import-protection tests that run Start's import protection
 * on a real app: a Vite dev server with Start's import-protection Vite
 * plugin (after the Start compiler, like the Start plugin orders them), a
 * stand-in `react` JSX runtime, and the violations import protection reports
 * to the user (dev server warnings, build errors and warnings), read from the
 * text it prints.
 */
import path from 'node:path'
import { importProtectionPlugin } from '../../src/vite/import-protection-plugin/plugin'
import { startDevServer } from '../dev-server'
import type { DevServer } from '@tanstack/compiler-test-utils/dev-server'
import type { ImportProtectionOptions } from '../../src/schema'
import type { ImportProtectionPluginOptions } from '../../src/vite/import-protection-plugin/types'
import type { StartDevServerOptions } from '../dev-server'
import type { PluginOption } from 'vite'

export interface ProtectedDevServerOptions {
  /**
   * The app's router entry (relative to the app root), registered with
   * import protection like `tanStackStart()` registers the app's
   * `src/router.tsx`: the module every client module of a Start app is
   * reached from. Default `src/entry.ts`. The start entry `src/start.ts` is
   * registered when the app has one.
   */
  router?: string
  /**
   * The server fn provider environment, when it is not `ssr` (e.g. `rsc`):
   * a third, server environment of the dev server.
   */
  providerEnvironment?: string
  /** Other plugins of the app, after import protection. */
  plugins?: Array<PluginOption>
  /** Vite configuration of the app (e.g. `server.warmup`). */
  config?: StartDevServerOptions['config']
  /**
   * Bundles the client from this entry (Vite's full-bundle dev,
   * `experimental.bundledDev`): `server.clientBundle()`.
   */
  bundledDev?: StartDevServerOptions['bundledDev']
}

/**
 * Starts a Vite dev server (`startDevServer`) on an app of `files` with
 * Start's import protection, configured by `importProtection` (Start's
 * `importProtection` option; source directory `src`), and with Start's
 * entries registered (`options.router`).
 */
export function startProtectedDevServer(
  files: Record<string, string>,
  importProtection: ImportProtectionOptions = {},
  options: ProtectedDevServerOptions = {},
): Promise<DevServer> {
  const {
    router = 'src/entry.ts',
    providerEnvironment = 'ssr',
    plugins = [],
    config = {},
    bundledDev,
  } = options
  return startDevServer({
    files,
    bundledDev,
    config:
      providerEnvironment === 'ssr'
        ? config
        : {
            ...config,
            environments: {
              ...config.environments,
              [providerEnvironment]: { consumer: 'server' },
            },
          },
    plugins: ({ root }) => [
      importProtectionPlugin({
        getConfig: (() => ({
          startConfig: { importProtection },
          resolvedStartConfig: {
            srcDirectory: path.join(root, 'src'),
            routerFilePath: path.join(root, router),
            startFilePath:
              'src/start.ts' in files
                ? path.join(root, 'src/start.ts')
                : undefined,
          },
        })) as unknown as ImportProtectionPluginOptions['getConfig'],
        framework: 'react',
        environments: [
          { name: 'client', type: 'client' },
          { name: 'ssr', type: 'server' },
          ...(providerEnvironment === 'ssr'
            ? []
            : [{ name: providerEnvironment, type: 'server' as const }]),
        ],
        providerEnvName: providerEnvironment,
      }),
      ...plugins,
    ],
  })
}

/**
 * An app whose server fn factory module `src/factory.ts` uses its denied
 * imports (the denied file `src/secret.server.ts` and the denied specifier
 * `@tanstack/react-start/server`) only inside `createMiddleware().server()`,
 * which the client never runs, and whose `src/leak.ts` uses the denied file
 * in a function the client may call; the router entry `src/entry.ts`
 * re-exports a server fn of the factory and the leak. `factoryTail` is
 * appended to the factory module (from line 9).
 */
export const serverFnFactoryApp = (factoryTail = '') => ({
  'src/secret.server.ts': `export const getSecret = () => 'MARK_SECRET'\n`,
  'src/factory.ts': `import { createMiddleware, createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { getSecret } from './secret.server'
const mw = createMiddleware({ type: 'function' }).server(({ next }) => {
  const req = getRequest()
  return next({ context: { req, secret: getSecret() } })
})
export const createSecretFn = createServerFn().middleware([mw])
${factoryTail}`,
  'src/usage.ts': `import { createSecretFn } from './factory'
export const fn = createSecretFn().handler(async ({ context }) => context)
`,
  'src/leak.ts': `import { getSecret } from './secret.server'
export const leak = () => getSecret()
`,
  'src/entry.ts': `export { fn } from './usage'
export { leak } from './leak'
`,
})

/**
 * A `factoryTail` of `serverFnFactoryApp` calling the denied
 * `getRequest()` at the top level of the factory module, which the client
 * runs (located at `src/factory.ts:9:24`).
 */
export const factoryTopLevelCall = `export const request = getRequest()\n`

/** A stand-in `react` package with the JSX runtime compiled JSX imports. */
export const reactRuntimeFiles: Record<string, string> = {
  'node_modules/react/package.json': JSON.stringify({
    name: 'react',
    type: 'module',
    exports: {
      './jsx-runtime': './jsx-runtime.js',
      './jsx-dev-runtime': './jsx-runtime.js',
    },
  }),
  'node_modules/react/jsx-runtime.js': `export const Fragment = Symbol('Fragment')
export const jsx = (type, props) => (typeof type === 'function' ? type(props) : type)
export const jsxs = jsx
export const jsxDEV = jsx
`,
}

export interface ReportedViolation {
  /** `client` or `server`. */
  environment: string
  /**
   * Where the violation is reported (`Importer:`): the importer relative to
   * the app root, with `:line:column` when the report has a location.
   */
  importer: string
}

/**
 * The import-protection violations reported in `output` (dev server logs,
 * build errors or warnings), in order.
 */
export function reportedViolations(
  output: string | Array<string>,
): Array<ReportedViolation> {
  const text = Array.isArray(output) ? output.join('\n') : output
  return text
    .split('[import-protection] Import denied in ')
    .slice(1)
    .map((report) => ({
      environment: /^(\w+)/.exec(report)![1]!,
      importer: /Importer: (\S+)/.exec(report)?.[1] ?? '',
    }))
}

/** Each distinct value of `values`, in order. */
export function distinct<T>(values: Array<T>): Array<T> {
  return [...new Set(values)]
}

/** `file:line:column` of the first `needle` on 1-based line `line` of `code`. */
export function locationIn(
  file: string,
  code: string,
  line: number,
  needle: string,
): string {
  const column = code.split('\n')[line - 1]!.indexOf(needle)
  if (column === -1) {
    throw new Error(`${needle} is not on line ${line}`)
  }
  return `${file}:${line}:${column + 1}`
}

/** The error a promise rejects with (fails when it resolves). */
export async function rejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise
  } catch (error) {
    return error as Error
  }
  throw new Error('expected the promise to reject')
}
