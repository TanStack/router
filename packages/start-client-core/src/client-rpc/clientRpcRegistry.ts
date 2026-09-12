import { TSS_SERVER_FUNCTION } from '../constants'
import type { ClientFnMeta } from '../constants'
import type { createClientRpc } from './createClientRpc'

type ClientRpcFactory = typeof createClientRpc

let clientRpcFactory: ClientRpcFactory | undefined

/**
 * Registered by the `createClientRpc` module. Compiled server function stubs
 * import that module, so any app that calls a server function from the client
 * has the factory available without the serialization adapter importing it.
 */
export function registerClientRpcFactory(factory: ClientRpcFactory): void {
  clientRpcFactory = factory
}

/**
 * Creates the client RPC for a server function reference revived from
 * serialized data. Uses the registered factory when the RPC client is already
 * bundled; otherwise the client (and its serializer) is loaded on the first
 * call, so apps without server functions never ship it.
 */
export function createRevivedClientRpc(functionId: string) {
  if (clientRpcFactory) {
    return clientRpcFactory(functionId)
  }

  const url = process.env.TSS_SERVER_FN_BASE + functionId
  const serverFnMeta: ClientFnMeta = { id: functionId }

  let rpc: ReturnType<ClientRpcFactory> | undefined
  const clientFn = (...args: Array<any>) => {
    if (!rpc && clientRpcFactory) {
      rpc = clientRpcFactory(functionId)
    }
    if (rpc) {
      return rpc(...args)
    }
    // Loading the module registers the factory for every later call.
    return import('./createClientRpc').then((m) =>
      (rpc ??= m.createClientRpc(functionId))(...args),
    )
  }

  return Object.assign(clientFn, {
    url,
    serverFnMeta,
    [TSS_SERVER_FUNCTION]: true,
  })
}
