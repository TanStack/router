import { createSerializationAdapter } from '@tanstack/router-core'
import { TSS_SERVER_FUNCTION } from '@tanstack/start-client-core'
import { getServerFnById } from '../getServerFnById'
import type { SerializationAdapter } from '@tanstack/router-core'

export const ServerFunctionSerializationAdapter: SerializationAdapter<{ serverFnMeta: { id: string } }, { functionId: string }, never> = createSerializationAdapter({
  key: '$TSS/serverfn',
  test: (v): v is { serverFnMeta: { id: string } } => {
    if (typeof v !== 'function') return false

    if (!(TSS_SERVER_FUNCTION in v)) return false

    return !!(v as unknown as Record<symbol, unknown>)[TSS_SERVER_FUNCTION]
  },
  toSerializable: ({ serverFnMeta }) => ({ functionId: serverFnMeta.id }),
  fromSerializable: ({ functionId }) => {
    const fn = async (opts: any, signal: any): Promise<any> => {
      // When a function ID is received through serialization (e.g., as a parameter
      // to another server function), it originates from the client and must be
      // validated the same way as direct HTTP calls to server functions.
      const serverFn = await getServerFnById(functionId, { fromClient: true })
      const result = await serverFn(opts ?? {}, signal)
      return result.result
    }
    return fn as never
  },
})
