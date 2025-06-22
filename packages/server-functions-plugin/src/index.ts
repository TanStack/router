import {
  TanStackDirectiveFunctionsPlugin,
  TanStackDirectiveFunctionsPluginEnv,
} from '@tanstack/directive-functions-plugin'
import type { Plugin, ViteDevServer } from 'vite'
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

export function createTanStackServerFnPlugin(opts: ServerFnPluginOpts): {
  client: Array<Plugin>
  ssr: Array<Plugin>
  server: Array<Plugin>
} {
  const directiveFnsById: Record<string, DirectiveFn> = {}
  let viteDevServer: ViteDevServer | undefined

  const onDirectiveFnsById = (d: Record<string, DirectiveFn>) => {
    // When directives are compiled, save them to our global variable
    // This variable will be used both during development to incrementally
    // look up server functions and during build/production to produce a
    // static manifest that can be read by the server build
    Object.assign(directiveFnsById, d)
    invalidateVirtualModule(
      viteDevServer,
      resolveViteId(opts.manifestVirtualImportId),
    )
  }

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
          if (this.environment.config.consumer !== 'server') {
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
  opts: TanStackServerFnPluginEnvOpts,
): Array<Plugin> {
  opts = {
    ...opts,
    client: {
      ...opts.client,
      envName: opts.client.envName || 'client',
    },
    server: {
      ...opts.server,
      envName: opts.server.envName || 'server',
    },
  }

  const directiveFnsById: Record<string, DirectiveFn> = {}
  let viteDevServer: ViteDevServer | undefined

  const onDirectiveFnsById = (d: Record<string, DirectiveFn>) => {
    // When directives are compiled, save them to our global variable
    // This variable will be used both during development to incrementally
    // look up server functions and during build/production to produce a
    // static manifest that can be read by the server build
    Object.assign(directiveFnsById, d)

    invalidateVirtualModule(
      viteDevServer,
      resolveViteId(opts.manifestVirtualImportId),
    )
  }

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
      // by its ID, import it, and call it. We can't do this in memory here because the builds happen in isolation,
      // so the manifest is like a serialized state from the client build to the server build
      name: 'tanstack-start-server-fn-vite-plugin-manifest-server',
      enforce: 'pre',
      configureServer(server) {
        viteDevServer = server
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
          if (this.environment.config.consumer !== 'server') {
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

function invalidateVirtualModule(
  viteDevServer: ViteDevServer | undefined,
  resolvedId: string,
) {
  if (viteDevServer) {
    const mod = viteDevServer.moduleGraph.getModuleById(resolvedId)
    if (mod) {
      viteDevServer.moduleGraph.invalidateModule(mod)
    }
  }
}
