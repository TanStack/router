/// <reference types="vite/client" />
import crypto from 'node:crypto'
import assert from 'node:assert'
import { TanStackDirectiveFunctionsPluginEnv } from '@tanstack/directive-functions-plugin'
import type { Plugin } from 'vite'
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
   * This virtual import ID will be used in the server build to import the manifest
   * and its modules.
   */
  manifestVirtualImportId: string
  generateFunctionId?: GenerateFunctionIdFnOptional
  callers: Array<
    ServerFnPluginEnvOpts & {
      envConsumer: 'client' | 'server'
      /**
       * Custom getServerFnById implementation for server callers.
       * Required for server callers that need to load modules from a different
       * environment.
       */
      getServerFnById?: string
    }
  >
  provider: ServerFnPluginEnvOpts
  directive: string
}

export type ServerFnPluginEnvOpts = {
  getRuntimeCode: () => string
  replacer: ReplacerFn
  envName: string
}

const debug =
  process.env.TSR_VITE_DEBUG &&
  ['true', 'server-functions-plugin'].includes(process.env.TSR_VITE_DEBUG)

const validateServerFnIdVirtualModule = `virtual:tanstack-start-validate-server-fn-id`

function parseIdQuery(id: string): {
  filename: string
  query: {
    [k: string]: string
  }
} {
  if (!id.includes('?')) return { filename: id, query: {} }
  const [filename, rawQuery] = id.split(`?`, 2) as [string, string]
  const query = Object.fromEntries(new URLSearchParams(rawQuery))
  return { filename, query }
}

export function TanStackServerFnPlugin(
  opts: TanStackServerFnPluginOpts,
): Array<Plugin> {
  const directiveFnsById: Record<string, DirectiveFn> = {}

  const onDirectiveFnsById = (d: Record<string, DirectiveFn>) => {
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

  let root = process.cwd()
  let command: 'build' | 'serve' = 'build'

  const generateFunctionId: GenerateFunctionIdFn = ({
    extractedFilename,
    functionName,
    filename,
  }) => {
    if (command === 'serve') {
      const rootWithTrailingSlash = withTrailingSlash(root)
      let file = extractedFilename
      if (extractedFilename.startsWith(rootWithTrailingSlash)) {
        file = extractedFilename.slice(rootWithTrailingSlash.length)
      }
      file = `/@id/${file}`

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

  const resolvedManifestVirtualImportId = resolveViteId(
    opts.manifestVirtualImportId,
  )

  const appliedEnvironments = new Set([
    ...opts.callers
      .filter((c) => c.envConsumer === 'server')
      .map((c) => c.envName),
    opts.provider.envName,
  ])

  const serverCallerEnvironments = new Map(
    opts.callers
      .filter((c) => c.envConsumer === 'server')
      .map((c) => [c.envName, c]),
  )

  // SSR is the provider when the provider environment is also a server caller environment
  // In this case, server-only-referenced functions won't be in the manifest (they're handled via direct imports)
  // When SSR is NOT the provider, server-only-referenced functions ARE in the manifest and need isClientReferenced check
  const ssrIsProvider = serverCallerEnvironments.has(opts.provider.envName)

  return [
    // The client plugin is used to compile the client directives
    // and save them so we can create a manifest
    TanStackDirectiveFunctionsPluginEnv({
      directive: opts.directive,
      onDirectiveFnsById,
      generateFunctionId,
      provider: opts.provider,
      callers: opts.callers,
      // Provide access to known directive functions so SSR callers can use
      // canonical extracted filenames from the client build
      getKnownDirectiveFns: () => directiveFnsById,
    }),
    {
      name: 'tanstack-start-server-fn-vite-plugin-validate-serverfn-id',
      apply: 'serve',
      load: {
        filter: {
          id: new RegExp(resolveViteId(validateServerFnIdVirtualModule)),
        },
        handler(id) {
          const parsed = parseIdQuery(id)
          assert(parsed)
          assert(parsed.query.id)
          if (directiveFnsById[parsed.query.id]) {
            return `export {}`
          }
          this.error(`Invalid server function ID: ${parsed.query.id}`)
        },
      },
    },
    {
      // On the server, we need to be able to read the server-function manifest from the client build.
      // This is likely used in the handler for server functions, so we can find the server function
      // by its ID, import it, and call it.
      name: 'tanstack-start-server-fn-vite-plugin-manifest-server',
      enforce: 'pre',
      applyToEnvironment: (env) => {
        return appliedEnvironments.has(env.name)
      },
      configResolved(config) {
        root = config.root
        command = config.command
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
          // a different server side environment is used for e.g. SSR and server functions
          if (this.environment.name !== opts.provider.envName) {
            const getServerFnById = serverCallerEnvironments.get(
              this.environment.name,
            )?.getServerFnById
            if (!getServerFnById) {
              throw new Error(
                `No getServerFnById implementation found for environment ${this.environment.name}`,
              )
            }

            return getServerFnById
          }

          if (this.environment.mode !== 'build') {
            const mod = `
            export async function getServerFnById(id) {
              const validateIdImport = ${JSON.stringify(validateServerFnIdVirtualModule)} + '?id=' + id
              await import(/* @vite-ignore */ '/@id/__x00__' + validateIdImport)
              const decoded = Buffer.from(id, 'base64url').toString('utf8')
              const devServerFn = JSON.parse(decoded)
              const mod = await import(/* @vite-ignore */ devServerFn.file)
              return mod[devServerFn.export]
            }
            `
            return mod
          }

          // When SSR is the provider, server-only-referenced functions aren't in the manifest,
          // so no isClientReferenced check is needed.
          // When SSR is NOT the provider (custom provider env), server-only-referenced
          // functions ARE in the manifest and need the isClientReferenced check to
          // block direct client HTTP requests to server-only-referenced functions.
          const includeClientReferencedCheck = !ssrIsProvider
          return generateManifestModule(
            directiveFnsById,
            includeClientReferencedCheck,
          )
        },
      },
    },
  ]
}

/**
 * Generates the manifest module code for server functions.
 * @param directiveFnsById - Map of function IDs to their directive function info
 * @param includeClientReferencedCheck - Whether to include isClientReferenced flag and runtime check.
 *   This is needed when SSR is NOT the provider, so server-only-referenced functions in the manifest
 *   can be blocked from client HTTP requests.
 */
function generateManifestModule(
  directiveFnsById: Record<string, DirectiveFn>,
  includeClientReferencedCheck: boolean,
): string {
  const manifestEntries = Object.entries(directiveFnsById)
    .map(([id, fn]) => {
      const baseEntry = `'${id}': {
                  functionName: '${fn.functionName}',
        importer: () => import(${JSON.stringify(fn.extractedFilename)})${
          includeClientReferencedCheck
            ? `,
        isClientReferenced: ${fn.isClientReferenced ?? true}`
            : ''
        }
      }`
      return baseEntry
    })
    .join(',')

  const getServerFnByIdParams = includeClientReferencedCheck ? 'id, opts' : 'id'
  const clientReferencedCheck = includeClientReferencedCheck
    ? `
      // If called from client, only allow client-referenced functions
      if (opts?.fromClient && !serverFnInfo.isClientReferenced) {
        throw new Error('Server function not accessible from client: ' + id)
      }
`
    : ''

  return `
    const manifest = {${manifestEntries}}

    export async function getServerFnById(${getServerFnByIdParams}) {
              const serverFnInfo = manifest[id]
              if (!serverFnInfo) {
                throw new Error('Server function info not found for ' + id)
              }
${clientReferencedCheck}
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
}

function resolveViteId(id: string) {
  return `\0${id}`
}
