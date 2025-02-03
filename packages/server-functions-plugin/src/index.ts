import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { TanStackDirectiveFunctionsPlugin } from '@tanstack/directive-functions-plugin'
import type { Plugin } from 'vite'
import type {
  DirectiveFn,
  ReplacerFn,
} from '@tanstack/directive-functions-plugin'

export type CreateRpcFn = (
  functionId: string,
  serverBase: string,
  splitImportFn?: string,
) => any

declare global {
  // eslint-disable-next-line no-var
  var TSR_directiveFnsById: Record<string, DirectiveFn>
}

export type ServerFnPluginOpts = {
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
  const ROOT = process.cwd()
  const manifestFilename =
    'node_modules/.tanstack-start/server-functions-manifest.json'

  globalThis.TSR_directiveFnsById = {}

  const onDirectiveFnsById = (d: Record<string, DirectiveFn>) => {
    // When directives are compiled, save them to our global variable
    // This variable will be used both during development to incrementally
    // look up server functions and during build/production to produce a
    // static manifest that can be read by the server build
    Object.assign(
      globalThis.TSR_directiveFnsById,
      Object.fromEntries(
        Object.entries(d).map(([id, fn]) => [
          id,
          {
            ...fn,
            // This importer is required for the development server to
            // work. It's also required in production, but cannot be serialized
            // into the manifest because it's a dynamic import. Instead, as you'll
            // see below, we augment the manifest output with a code-generated importer
            // that looks exactly like this.
            importer: () => import(fn.extractedFilename),
          },
        ]),
      ),
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
        // devSplitImporter: `(globalThis.app.getRouter('server').internals.devServer.ssrLoadModule)`,
      }),
      {
        // Now that we have the directiveFnsById, we need to create a new
        // virtual module that can be used to import that manifest
        name: 'tanstack-start-server-fn-vite-plugin-build-client',
        generateBundle() {
          // In production, we create a manifest so we can
          // access it later in the server build, which likely does not run in the
          // same vite build environment. This is essentially a
          // serialized state transfer from the client build to the server
          // build.

          // Ensure the manifest directory exists
          mkdirSync(path.dirname(manifestFilename), { recursive: true })

          // Write the manifest to disk
          writeFileSync(
            path.join(ROOT, manifestFilename),
            JSON.stringify(
              Object.fromEntries(
                Object.entries(globalThis.TSR_directiveFnsById).map(
                  ([id, fn]) => [
                    id,
                    {
                      functionName: fn.functionName,
                      extractedFilename: fn.extractedFilename,
                    },
                  ],
                ),
              ),
            ),
          )
        },
      },
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
        // devSplitImporter: `(globalThis.app.getRouter('server').internals.devServer.ssrLoadModule)`,
      }),
    ],
    server: [
      {
        // On the server, we need to be able to read the server-function manifest from the client build.
        // This is likely used in the handler for server functions, so we can find the server function
        // by its ID, import it, and call it. We can't do this in memory here because the builds happen in isolation,
        // so the manifest is like a serialized state from the client build to the server build
        name: 'tanstack-start-server-fn-vite-plugin-manifest-server',
        enforce: 'pre',
        resolveId: (id) => (id === opts.manifestVirtualImportId ? id : null),
        load(id) {
          if (id !== opts.manifestVirtualImportId) return null

          // In development, we **can** use the in-memory manifest, and we should
          // since it will be incrementally updated as we use the app and dynamic
          // imports are triggered.
          if (process.env.NODE_ENV === 'development') {
            return `export default globalThis.TSR_directiveFnsById`
          }

          // In production, we need to read the manifest from the client build.
          // The manifest at that point should contain the full set of server functions
          // that were found in the client build.
          const manifest = JSON.parse(
            readFileSync(path.join(ROOT, manifestFilename), 'utf-8'),
          )

          // The manifest has a lot of information, but for now we only need to
          // provide the function ID for lookup and the importer for loading
          // This should keep the manifest small for now.
          const manifestWithImports = `
          export default {${Object.entries(manifest)
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
