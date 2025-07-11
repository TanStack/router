import {
  TanStackDirectiveFunctionsPlugin,
  TanStackDirectiveFunctionsPluginEnv,
} from '@tanstack/directive-functions-plugin'
import type { DevEnvironment, Plugin, ViteDevServer } from 'vite'
import type {
  DirectiveFn,
  ReplacerFn,
} from '@tanstack/directive-functions-plugin'

export type CreateRpcFn = (
  functionId: string,
  serverBase: string,
  splitImportFn?: string,
) => any

export type ServerFnPluginOpts = {
  /**
   * The virtual import ID that will be used to import the server function manifest.
   * This virtual import ID will be used in the server build to import the manifest
   * and its modules.
   */
  manifestVirtualImportId: string
  client: ServerFnPluginEnvOpts
  ssr: ServerFnPluginEnvOpts
  server: ServerFnPluginEnvOpts
}

export type ServerFnPluginEnvOpts = {
  getRuntimeCode: () => string
  replacer: ReplacerFn
}

const debug =
  process.env.TSR_VITE_DEBUG &&
  ['true', 'server-functions-plugin'].includes(process.env.TSR_VITE_DEBUG)

export function createTanStackServerFnPlugin(opts: ServerFnPluginOpts): {
  client: Array<Plugin>
  ssr: Array<Plugin>
  server: Array<Plugin>
} {
  const directiveFnsById: Record<string, DirectiveFn> = {}
  let viteDevServer: ViteDevServer | undefined

  const onDirectiveFnsById = buildOnDirectiveFnsByIdCallback({
    directiveFnsById,
    manifestVirtualImportId: opts.manifestVirtualImportId,
    invalidateModule: (id) => {
      if (viteDevServer) {
        const mod = viteDevServer.moduleGraph.getModuleById(id)
        if (mod) {
          if (debug) {
            console.info(`invalidating module ${JSON.stringify(mod.id)}`)
          }
          viteDevServer.moduleGraph.invalidateModule(mod)
        }
      }
    },
  })

  const directive = 'use server'
  const directiveLabel = 'Server Function'

  return {
    client: [
      // The client plugin is used to compile the client directives
      // and save them so we can create a manifest
      TanStackDirectiveFunctionsPlugin({
        envLabel: 'Client',
        directive,
        directiveLabel,
        getRuntimeCode: opts.client.getRuntimeCode,
        replacer: opts.client.replacer,
        onDirectiveFnsById,
      }),
    ],
    ssr: [
      // The SSR plugin is used to compile the server directives
      TanStackDirectiveFunctionsPlugin({
        envLabel: 'SSR',
        directive,
        directiveLabel,
        getRuntimeCode: opts.ssr.getRuntimeCode,
        replacer: opts.ssr.replacer,
        onDirectiveFnsById,
      }),
    ],
    server: [
      {
        // On the server, we need to be able to read the server-function manifest from the client build.
        // This is likely used in the handler for server functions, so we can find the server function
        // by its ID, import it, and call it.
        name: 'tanstack-start-server-fn-vite-plugin-manifest-server',
        enforce: 'pre',
        configureServer(server) {
          viteDevServer = server
        },
        resolveId(id) {
          if (id === opts.manifestVirtualImportId) {
            return resolveViteId(id)
          }

          return undefined
        },
        load(id) {
          if (id !== resolveViteId(opts.manifestVirtualImportId)) {
            return undefined
          }

          const manifestWithImports = `
          export default {${Object.entries(directiveFnsById)
            .map(
              ([id, fn]: any) =>
                `'${id}': {
                  functionName: '${fn.functionName}',
                  importer: () => import(${JSON.stringify(fn.extractedFilename)})
                }`,
            )
            .join(',')}}`

          return manifestWithImports
        },
      },
      // On the server, we need to compile the server functions
      // so they can be called by other server functions.
      // This is also where we split the server function into a separate file
      // so we can load them on demand in the worker.
      TanStackDirectiveFunctionsPlugin({
        envLabel: 'Server',
        directive,
        directiveLabel,
        getRuntimeCode: opts.server.getRuntimeCode,
        replacer: opts.server.replacer,
        onDirectiveFnsById,
      }),
    ],
  }
}

export interface TanStackServerFnPluginEnvOpts {
  /**
   * The virtual import ID that will be used to import the server function manifest.
   * This virtual import ID will be used in the server build to import the manifest
   * and its modules.
   */
  manifestVirtualImportId: string
  client: {
    envName?: string
    getRuntimeCode: () => string
    replacer: ReplacerFn
  }
  server: {
    envName?: string
    getRuntimeCode: () => string
    replacer: ReplacerFn
  }
}

export function TanStackServerFnPluginEnv(
  _opts: TanStackServerFnPluginEnvOpts,
): Array<Plugin> {
  const opts = {
    ..._opts,
    client: {
      ..._opts.client,
      envName: _opts.client.envName || 'client',
    },
    server: {
      ..._opts.server,
      envName: _opts.server.envName || 'server',
    },
  }

  const directiveFnsById: Record<string, DirectiveFn> = {}
  let serverDevEnv: DevEnvironment | undefined

  const onDirectiveFnsById = buildOnDirectiveFnsByIdCallback({
    directiveFnsById,
    manifestVirtualImportId: opts.manifestVirtualImportId,
    invalidateModule: (id) => {
      if (serverDevEnv) {
        const mod = serverDevEnv.moduleGraph.getModuleById(id)
        if (mod) {
          if (debug) {
            console.info(
              `invalidating module ${JSON.stringify(mod.id)} in server environment`,
            )
          }
          serverDevEnv.moduleGraph.invalidateModule(mod)
        }
      }
    },
  })

  const directive = 'use server'
  const directiveLabel = 'Server Function'

  return [
    // The client plugin is used to compile the client directives
    // and save them so we can create a manifest
    TanStackDirectiveFunctionsPluginEnv({
      directive,
      directiveLabel,
      onDirectiveFnsById,
      environments: {
        client: {
          envLabel: 'Client',
          getRuntimeCode: opts.client.getRuntimeCode,
          replacer: opts.client.replacer,
          envName: opts.client.envName,
        },
        server: {
          envLabel: 'Server',
          getRuntimeCode: opts.server.getRuntimeCode,
          replacer: opts.server.replacer,
          envName: opts.server.envName,
        },
      },
    }),
    {
      // On the server, we need to be able to read the server-function manifest from the client build.
      // This is likely used in the handler for server functions, so we can find the server function
      // by its ID, import it, and call it.
      name: 'tanstack-start-server-fn-vite-plugin-manifest-server',
      enforce: 'pre',
      configureServer(viteDevServer) {
        serverDevEnv = viteDevServer.environments[opts.server.envName]
        if (!serverDevEnv) {
          throw new Error(
            `TanStackServerFnPluginEnv: environment "${opts.server.envName}" not found`,
          )
        }
      },
      resolveId: {
        filter: { id: new RegExp(opts.manifestVirtualImportId) },
        handler(id) {
          return resolveViteId(id)
        },
      },
      load: {
        filter: { id: new RegExp(resolveViteId(opts.manifestVirtualImportId)) },
        handler() {
          if (this.environment.name !== opts.server.envName) {
            return `export default {}`
          }
          const manifestWithImports = `
          export default {${Object.entries(directiveFnsById)
            .map(
              ([id, fn]: any) =>
                `'${id}': {
                  functionName: '${fn.functionName}',
                  importer: () => import(${JSON.stringify(fn.extractedFilename)})
                }`,
            )
            .join(',')}}`

          return manifestWithImports
        },
      },
    },
  ]
}

function resolveViteId(id: string) {
  return `\0${id}`
}

function buildOnDirectiveFnsByIdCallback(opts: {
  invalidateModule: (resolvedId: string) => void
  directiveFnsById: Record<string, DirectiveFn>
  manifestVirtualImportId: string
}) {
  const onDirectiveFnsById = (d: Record<string, DirectiveFn>) => {
    if (debug) {
      console.info(`onDirectiveFnsById received: `, d)
    }

    // do we already know all the server functions? if so, we can exit early
    // this could happen if the same file is compiled first in the client and then in the server environment
    const newKeys = Object.keys(d).filter(
      (key) => !(key in opts.directiveFnsById),
    )
    if (newKeys.length > 0) {
      // When directives are compiled, save them to `directiveFnsById`
      // This state will be used both during development to incrementally
      // look up server functions and during build/production to produce a
      // static manifest that can be read by the server build
      Object.assign(opts.directiveFnsById, d)
      if (debug) {
        console.info(`directiveFnsById after update: `, opts.directiveFnsById)
      }

      opts.invalidateModule(resolveViteId(opts.manifestVirtualImportId))
    }
  }
  return onDirectiveFnsById
}
