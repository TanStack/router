import { TSS_CLIENT_RPC, TSS_SERVER_FUNCTION } from '../constants'
import { getStartOptions } from '../getStartOptions'
import { serverFnFetcher } from './serverFnFetcher'
import type { ClientFnMeta } from '../constants'

export function createClientRpc(functionId: string) {
  const url = process.env.TSS_SERVER_FN_BASE + functionId
  const serverFnMeta: ClientFnMeta = { id: functionId }

  const clientFn = (...args: Array<any>) => {
    const startFetch = getStartOptions()?.serverFns?.fetch
    return serverFnFetcher(url, args, startFetch ?? fetch)
  }

  return Object.assign(clientFn, {
    url,
    serverFnMeta,
    [TSS_SERVER_FUNCTION]: true,
  })
}

// Lets revived server function references reuse this module whenever compiled
// stubs have bundled it, without the serialization adapter importing it (and
// the serializer) into every app.
;(globalThis as any)[TSS_CLIENT_RPC] = createClientRpc
