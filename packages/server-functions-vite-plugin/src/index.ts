import { fileURLToPath, pathToFileURL } from 'node:url'

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { compileDirectives } from './compilers'
import { logDiff } from './logger'
import type { CompileDirectivesOpts, DirectiveFn } from './compilers'
import type { Plugin } from 'vite'

const debug = Boolean(process.env.TSR_VITE_DEBUG)

export type ServerFunctionsViteOptions = Pick<
  CompileDirectivesOpts,
  'directive' | 'directiveLabel' | 'getRuntimeCode' | 'replacer'
>

export type CreateClientRpcFn = (functionId: string) => any
export type CreateSsrRpcFn = (functionId: string) => any
export type CreateServerRpcFn = (
  functionId: string,
  splitImportFn: string,
) => any

const createDirectiveRx = (directive: string) =>
  new RegExp(`"${directive}"|'${directive}'`, 'g')

export function createTanStackServerFnPlugin(_opts?: {}): {
  client: Array<Plugin>
  ssr: Array<Plugin>
  server: Array<Plugin>
} {
  const ROOT = process.cwd()
  const manifestFilename =
    'node_modules/.tanstack-start/server-functions-manifest.json'
  const directiveFnsById: Record<string, DirectiveFn> = {}

  const directiveFnsByIdToManifest = (
    directiveFnsById: Record<string, DirectiveFn>,
  ) =>
    Object.fromEntries(
      Object.entries(directiveFnsById).map(([id, fn]) => [
        id,
        {
          functionName: fn.functionName,
          referenceName: fn.referenceName,
          splitFilename: fn.splitFilename,
          filename: fn.filename,
          chunkName: fn.chunkName,
        },
      ]),
    )

  const readManifestPlugin = (): Plugin => ({
    name: 'tanstack-start-server-fn-vite-plugin-manifest',
    enforce: 'pre',
    resolveId: (id) => {
      if (id === 'tsr:server-fn-manifest') {
        return id
      }

      return null
    },
    load(id) {
      if (id === 'tsr:server-fn-manifest') {
        return `export default ${JSON.stringify(
          directiveFnsByIdToManifest(directiveFnsById),
        )}`
      }

      return null
    },
  })

  return {
    client: [
      // The client plugin is used to compile the client directives
      // and save them so we can create a manifest
      TanStackDirectiveFunctionsPlugin({
        directive: 'use server',
        directiveLabel: 'Server Function',
        getRuntimeCode: () =>
          `import { createClientRpc } from '@tanstack/start/client-runtime'`,
        replacer: (opts) =>
          // On the client, all we need is the function ID
          `createClientRpc(${JSON.stringify(opts.functionId)})`,
        onDirectiveFnsById: (d) => {
          // When directives are compiled, save them so we
          // can create a manifest
          Object.assign(directiveFnsById, d)
        },
      }),
      // Now that we have the directiveFnsById, we need to create a new
      // virtual module that can be used to import that manifest
      {
        name: 'tanstack-start-server-fn-vite-plugin-build-client',
        generateBundle() {
          // We also need to create a production manifest so we can
          // access it the server build, which does not run in the
          // same vite build environment
          console.log('Generating production manifest')
          mkdirSync(path.dirname(manifestFilename), { recursive: true })
          writeFileSync(
            path.join(ROOT, manifestFilename),
            JSON.stringify(directiveFnsByIdToManifest(directiveFnsById)),
          )
        },
      },
    ],
    ssr: [
      readManifestPlugin(),
      // The SSR plugin is used to compile the server directives
      TanStackDirectiveFunctionsPlugin({
        directive: 'use server',
        directiveLabel: 'Server Function',
        getRuntimeCode: () =>
          `import { createSsrRpc } from '@tanstack/start/ssr-runtime'`,
        replacer: (opts) =>
          // During SSR, we just need the function ID since our server environment
          // is split into a worker. Similar to the client, we'll use the ID
          // to call into the worker using a local http event.
          `createSsrRpc(${JSON.stringify(opts.functionId)})`,
        onDirectiveFnsById: (d) => {
          // When directives are compiled, save them so we
          // can create a manifest
          Object.assign(directiveFnsById, d)
        },
      }),
    ],
    server: [
      readManifestPlugin(),
      // On the server, we need to compile the server functions
      // so they can be called by other server functions.
      // This is also where we split the server function into a separate file
      // so we can load them on demand in the worker.
      TanStackDirectiveFunctionsPlugin({
        directive: 'use server',
        directiveLabel: 'Server Function',
        getRuntimeCode: () =>
          `import { createServerRpc } from '@tanstack/start/server-runtime'`,
        replacer: (opts) =>
          // By using the provided splitImportFn, we can both trigger vite
          // to create a new chunk/entry for the server function and also
          // replace other function references to it with the import statement
          `createServerRpc(${JSON.stringify(opts.functionId)}, ${opts.isSplitFn ? opts.fn : opts.splitImportFn})`,
        onDirectiveFnsById: (d) => {
          // When directives are compiled, save them so we
          // can create a manifest
          Object.assign(directiveFnsById, d)
        },
      }),
      (() => {
        let serverFunctionsManifest: Record<string, DirectiveFn>
        return {
          name: 'tanstack-start-server-fn-vite-plugin-build-',
          enforce: 'post',
          apply: 'build',
          config(config) {
            // We use a file to store the manifest so we can access it between
            // vite environments
            serverFunctionsManifest = JSON.parse(
              readFileSync(path.join(ROOT, manifestFilename), 'utf-8'),
            )

            return {
              build: {
                rollupOptions: {
                  output: {
                    chunkFileNames: '[name].mjs',
                    entryFileNames: '[name].mjs',
                  },
                  treeshake: true,
                },
              },
            }
          },

          configResolved(config) {
            const serverFnEntries = Object.fromEntries(
              Object.entries(serverFunctionsManifest).map(([id, fn]) => {
                return [fn.chunkName, fn.splitFilename]
              }),
            )

            config.build.rollupOptions.input = {
              entry: Array.isArray(config.build.rollupOptions.input)
                ? config.build.rollupOptions.input[0]
                : typeof config.build.rollupOptions.input === 'object' &&
                    'entry' in config.build.rollupOptions.input
                  ? config.build.rollupOptions.input.entry
                  : ((() => {
                      throw new Error('Invalid input')
                    }) as any),
              ...serverFnEntries,
            }
            console.log(config.build.rollupOptions.input)
          },
        }
      })(),
    ],
  }
}

export function TanStackDirectiveFunctionsPlugin(
  opts: ServerFunctionsViteOptions & {
    onDirectiveFnsById?: (directiveFnsById: Record<string, DirectiveFn>) => void
  },
): Plugin {
  let ROOT: string = process.cwd()

  const directiveRx = createDirectiveRx(opts.directive)

  return {
    name: 'tanstack-start-directive-vite-plugin',
    enforce: 'pre',
    configResolved: (config) => {
      ROOT = config.root
    },
    transform(code, id) {
      const url = pathToFileURL(id)
      url.searchParams.delete('v')
      id = fileURLToPath(url).replace(/\\/g, '/')

      if (!directiveRx.test(code)) {
        return null
      }

      const { compiledResult, directiveFnsById } = compileDirectives({
        ...opts,
        code,
        root: ROOT,
        filename: id,
        // globalThis.app currently refers to Vinxi's app instance. In the future, it can just be the
        // vite dev server instance we get from Nitro.
        devSplitImporter: `(globalThis.app.getRouter('server').internals.devServer.ssrLoadModule)`,
      })

      opts.onDirectiveFnsById?.(directiveFnsById)

      if (debug) console.info('Directive Input/Output')
      if (debug) logDiff(code, compiledResult.code)

      return compiledResult
    },
  }
}
