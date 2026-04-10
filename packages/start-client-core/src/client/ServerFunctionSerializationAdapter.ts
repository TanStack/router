import { createSerializationAdapter } from '@tanstack/router-core'
import { TSS_SERVER_FUNCTION } from '../constants'
import { createClientRpc } from '../client-rpc/createClientRpc'
import type { SerializationAdapter } from '@tanstack/router-core'

export const ServerFunctionSerializationAdapter: SerializationAdapter<
  { serverFnMeta: { id: string } },
  { functionId: string },
  never
> = createSerializationAdapter({
  key: '$TSS/serverfn',
  test: (v): v is { serverFnMeta: { id: string } } => {
    if (typeof v !== 'function') return false

    if (!(TSS_SERVER_FUNCTION in v)) return false

    return !!(v as unknown as Record<symbol, unknown>)[TSS_SERVER_FUNCTION]
  },
  toSerializable: ({ serverFnMeta }) => ({ functionId: serverFnMeta.id }),
  fromSerializable: ({ functionId }) => createClientRpc(functionId),
})
