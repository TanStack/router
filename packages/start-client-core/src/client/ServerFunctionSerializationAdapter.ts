import { createSerializationAdapter } from '@tanstack/router-core'
import { TSS_CLIENT_RPC, TSS_SERVER_FUNCTION } from '../constants'
import type { ClientFnMeta } from '../constants'
import type { createClientRpc } from '../client-rpc/createClientRpc'

function getClientRpc() {
  return (globalThis as any)[TSS_CLIENT_RPC] as
    | typeof createClientRpc
    | undefined
}

/**
 * Compiled server function stubs import the client RPC module, which publishes
 * its factory under `TSS_CLIENT_RPC`. Reading it from there keeps this adapter
 * (registered on every hydration) from importing the RPC client and its
 * serializer into apps that never call a server function.
 */
function reviveServerFn(functionId: string) {
  const rpc = getClientRpc()
  if (rpc) {
    return rpc(functionId)
  }
  // Hydration must still succeed, and the reference may be revived before the
  // async chunk that bundles the client evaluates. Resolve the client again on
  // each call, and report it missing only then.
  const serverFnMeta: ClientFnMeta = { id: functionId }
  const clientFn = (...args: Array<any>) => {
    const lateRpc = getClientRpc()
    if (!lateRpc) {
      throw new Error(`No client bundled for server function ${functionId}`)
    }
    return lateRpc(functionId)(...args)
  }
  return Object.assign(clientFn, {
    url: process.env.TSS_SERVER_FN_BASE + functionId,
    serverFnMeta,
    [TSS_SERVER_FUNCTION]: true,
  })
}

export const ServerFunctionSerializationAdapter = createSerializationAdapter({
  key: '$TSS/serverfn',
  test: (v): v is { serverFnMeta: { id: string } } => {
    if (typeof v !== 'function') return false

    if (!(TSS_SERVER_FUNCTION in v)) return false

    return !!v[TSS_SERVER_FUNCTION]
  },
  toSerializable: ({ serverFnMeta }) => ({ functionId: serverFnMeta.id }),
  fromSerializable: ({ functionId }) => reviveServerFn(functionId),
})
