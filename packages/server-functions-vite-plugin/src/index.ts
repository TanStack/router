import { fileURLToPath, pathToFileURL } from 'node:url'

import { compileDirectives } from './compilers'
import { logDiff } from './logger'
import type { CompileDirectivesOpts, DirectiveFn } from './compilers'
import type { Plugin } from 'vite'

const debug = Boolean(process.env.TSR_VITE_DEBUG) || (true as boolean)

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

export function createTanStackServerFnPlugin(
  opts: ServerFunctionsViteOptions,
): {
  client: Array<Plugin>
  ssr: Array<Plugin>
  server: Array<Plugin>
} {
  let directiveFnsById: Record<string, DirectiveFn> = {}

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
          // When the client directives are compiled, save them so we
          // can create a manifest
          directiveFnsById = d
        },
      }),
      // Now that we have the directiveFnsById, we need to create a new
      // virtual module that can be used to import that manifest
      {
        name: 'tanstack-start-server-fn-vite-plugin-manifest',
        resolveId: (id) => {
          if (id === 'virtual:tanstack-start-server-fn-manifest') {
            return JSON.stringify(
              Object.fromEntries(
                Object.entries(directiveFnsById).map(([id, fn]) => [
                  id,
                  {
                    functionName: fn.functionName,
                    referenceName: fn.referenceName,
                    splitFileId: fn.splitFileId,
                  },
                ]),
              ),
            )
          }

          return null
        },
      },
    ],
    ssr: [
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
      }),
    ],
    server: [
      // On the server, we need to compile the server functions
      // so they can be called by other server functions.
      // This is also where we split the server function into a separate file
      // so we can load them on demand in the worker.
      TanStackDirectiveFunctionsPlugin({
        directive: 'use server',
        directiveLabel: 'Server Function',
        getRuntimeCode: () =>
          `import { createServerRpc } from '@tanstack/start/ssr-runtime'`,
        replacer: (opts) =>
          // By using the provided splitImportFn, we can both trigger vite
          // to create a new chunk/entry for the server function and also
          // replace other function references to it with the import statement
          `createServerRpc(${JSON.stringify(opts.functionId)}, ${JSON.stringify(opts.splitImportFn)})`,
      }),
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
      })

      opts.onDirectiveFnsById?.(directiveFnsById)

      if (debug) console.info('Directive Input/Output')
      if (debug) logDiff(code, compiledResult.code.replace(/ctx/g, 'blah'))

      return compiledResult
    },
  }
}
