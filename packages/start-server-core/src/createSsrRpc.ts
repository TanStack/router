import { TSS_SERVER_FUNCTION } from '@tanstack/start-client-core'
import type { ClientFnMeta } from '@tanstack/start-client-core'
import { getServerFnById } from './getServerFnById'
import type { ServerFn } from '#tanstack-start-server-fn-resolver'

export type SsrRpcImporter = () => Promise<ServerFn>

export const createSsrRpc = (functionId: string, importer?: SsrRpcImporter) => {
  const url = process.env.TSS_SERVER_FN_BASE + functionId
  const serverFnMeta: ClientFnMeta = { id: functionId }

  const fn = async (...args: Array<any>): Promise<any> => {
    // If an importer is provided, use it directly (server-to-server call within the SSR environment)
    // Otherwise, fall back to manifest lookup (client-to-server call, server functions that are only referenced on the server or if the provider environment is not SSR)
    const serverFn = importer
      ? await importer()
      : await getServerFnById(functionId)
    return serverFn(...args)
  }

  return Object.assign(fn, {
    url,
    serverFnMeta,
    [TSS_SERVER_FUNCTION]: true,
  })
}
