import { createSerializationAdapter } from '@tanstack/router-core'
import { TSS_SERVER_FUNCTION } from '../constants'
import { createRevivedClientRpc } from '../client-rpc/clientRpcRegistry'

export const ServerFunctionSerializationAdapter = createSerializationAdapter({
  key: '$TSS/serverfn',
  test: (v): v is { serverFnMeta: { id: string } } => {
    if (typeof v !== 'function') return false

    if (!(TSS_SERVER_FUNCTION in v)) return false

    return !!v[TSS_SERVER_FUNCTION]
  },
  toSerializable: ({ serverFnMeta }) => ({ functionId: serverFnMeta.id }),
  fromSerializable: ({ functionId }) => createRevivedClientRpc(functionId),
})
