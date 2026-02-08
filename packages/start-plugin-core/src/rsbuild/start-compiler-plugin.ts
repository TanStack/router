import { createRspackPlugin } from 'unplugin'
import { VIRTUAL_MODULES } from '@tanstack/start-server-core'
import { VITE_ENVIRONMENT_NAMES } from '../constants'
import { getServerFnsById } from './start-compiler-loader'
import type { ServerFn } from '../start-compiler-plugin/types'

function generateManifestModule(
  serverFnsById: Record<string, ServerFn>,
  includeClientReferencedCheck: boolean,
): string {
  const manifestEntries = Object.entries(serverFnsById)
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

export function createServerFnResolverPlugin(opts: {
  environmentName: string
  providerEnvName: string
}) {
  const ssrIsProvider = opts.providerEnvName === VITE_ENVIRONMENT_NAMES.server
  const includeClientReferencedCheck = !ssrIsProvider

  return createRspackPlugin(() => ({
    name: `tanstack-start-core:server-fn-resolver:${opts.environmentName}`,
    resolveId(id) {
      if (id === VIRTUAL_MODULES.serverFnResolver) {
        return id
      }
      return null
    },
    load(id) {
      if (id !== VIRTUAL_MODULES.serverFnResolver) return null
      if (opts.environmentName !== opts.providerEnvName) {
        return `export { getServerFnById } from '@tanstack/start-server-core/server-fn-ssr-caller'`
      }
      const serverFnsById = getServerFnsById()
      return generateManifestModule(serverFnsById, includeClientReferencedCheck)
    },
  }))
}
