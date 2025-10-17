/// <reference types="vite/client" />
import crypto from 'node:crypto'
import { TanStackDirectiveFunctionsPluginEnv } from '@tanstack/directive-functions-plugin'
import type { DevEnvironment, Plugin } from 'vite'
import type {
  DirectiveFn,
  GenerateFunctionIdFn,
  ReplacerFn,
} from '@tanstack/directive-functions-plugin'

export type GenerateFunctionIdFnOptional = (
  opts: Omit<Parameters<GenerateFunctionIdFn>[0], 'extractedFilename'>,
) => string | undefined

export type TanStackServerFnPluginOpts = {
  /**
   * The virtual import ID that will be used to import the server function manifest.
   * This virtual import ID will be used in the server build to import the manifest
   * and its modules.
   */
  manifestVirtualImportId: string
  generateFunctionId?: GenerateFunctionIdFnOptional
  client: ServerFnPluginEnvOpts
  server: ServerFnPluginEnvOpts
}

export type ServerFnPluginEnvOpts = {
  getRuntimeCode: () => string
  replacer: ReplacerFn
  envName?: string
}

const debug =
  process.env.TSR_VITE_DEBUG &&
  ['true', 'server-functions-plugin'].includes(process.env.TSR_VITE_DEBUG)

export function TanStackServerFnPlugin(
  _opts: TanStackServerFnPluginOpts,
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

  const onDirectiveFnsById = (d: Record<string, DirectiveFn>) => {
    if (serverDevEnv) {
      return
    }
    if (debug) {
      console.info(`onDirectiveFnsById received: `, d)
    }
    Object.assign(directiveFnsById, d)
    if (debug) {
      console.info(`directiveFnsById after update: `, directiveFnsById)
    }
  }

  const entryIdToFunctionId = new Map<string, string>()
  const functionIds = new Set<string>()

  function withTrailingSlash(path: string): string {
    if (path[path.length - 1] !== '/') {
      return `${path}/`
    }
    return path
  }

  const generateFunctionId: GenerateFunctionIdFn = ({
    extractedFilename,
    functionName,
    filename,
  }) => {
    if (serverDevEnv) {
      const root = serverDevEnv.config.root

      let file = extractedFilename
      if (extractedFilename.startsWith(withTrailingSlash(root))) {
        file = extractedFilename.slice(root.length)
      }
      file = `/@id${file[0] === '/' ? '' : '/'}${file}`

      const serverFn: {
        file: string
        export: string
      } = {
        file,
        export: functionName,
      }
      const base64 = Buffer.from(JSON.stringify(serverFn), 'utf8').toString(
        'base64url',
      )
      return base64
    }

    // production build allows to override the function ID generation
    const entryId = `${filename}--${functionName}`
    let functionId = entryIdToFunctionId.get(entryId)
    if (functionId === undefined) {
      if (opts.generateFunctionId) {
        functionId = opts.generateFunctionId({
          functionName,
          filename,
        })
      }
      if (!functionId) {
        functionId = crypto.createHash('sha256').update(entryId).digest('hex')
      }
      // Deduplicate in case the generated id conflicts with an existing id
      if (functionIds.has(functionId)) {
        let deduplicatedId
        let iteration = 0
        do {
          deduplicatedId = `${functionId}_${++iteration}`
        } while (functionIds.has(deduplicatedId))
        functionId = deduplicatedId
      }
      entryIdToFunctionId.set(entryId, functionId)
      functionIds.add(functionId)
    }
    return functionId
  }
  const directive = 'use server'
  const directiveLabel = 'Server Function'

  const resolvedManifestVirtualImportId = resolveViteId(
    opts.manifestVirtualImportId,
  )

  return [
    // The client plugin is used to compile the client directives
    // and save them so we can create a manifest
    TanStackDirectiveFunctionsPluginEnv({
      directive,
      directiveLabel,
      onDirectiveFnsById,
      generateFunctionId,
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
        handler() {
          return resolvedManifestVirtualImportId
        },
      },
      load: {
        filter: { id: new RegExp(resolvedManifestVirtualImportId) },
        handler() {
          if (this.environment.name !== opts.server.envName) {
            return `export default {}`
          }

          if (this.environment.mode !== 'build') {
            const mod = `
            export async function getServerFnById(id) {
              const decoded = Buffer.from(id, 'base64url').toString('utf8')
              const devServerFn = JSON.parse(decoded)
              const mod = await import(/* @vite-ignore */ devServerFn.file)
              return mod[devServerFn.export]
            }
            `
            return mod
          }

          const mod = `
          const manifest = {${Object.entries(directiveFnsById)
            .map(
              ([id, fn]: any) =>
                `'${id}': {
                  functionName: '${fn.functionName}',
                  importer: () => import(${JSON.stringify(fn.extractedFilename)})
                }`,
            )
            .join(',')}}
            export async function getServerFnById(id) {
              const serverFnInfo = manifest[id]
              if (!serverFnInfo) {
                throw new Error('Server function info not found for ' + id)
              }
              const fnModule = await serverFnInfo.importer()

              if (!fnModule) {
                console.info('serverFnInfo', serverFnInfo)
                throw new Error('Server function module not resolved for ' + id)
              }

              const action = fnModule[serverFnInfo.functionName]

              if (!action) {
                  console.info('serverFnInfo', serverFnInfo)
                  console.info('fnModule', fnModule)

                throw new Error(
                  \`Server function module export not resolved for serverFn ID: \${id}\`,
                )
              }
              return action
            }
          `

          return mod
        },
      },
    },
  ]
}

function resolveViteId(id: string) {
  return `\0${id}`
}
