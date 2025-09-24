import { createSerializationAdapter } from '@tanstack/router-core'
import { TSS_SERVER_FUNCTION } from '@tanstack/start-client-core'
import { createServerRpc } from '../createServerRpc'
import { getServerFnById } from '../getServerFnById'

export const ServerFunctionSerializationAdapter = createSerializationAdapter({
  key: '$TSS/serverfn',
  test: (v): v is { functionId: string } => {
    if (typeof v !== 'function') return false

    if (!(TSS_SERVER_FUNCTION in v)) return false

    return !!v[TSS_SERVER_FUNCTION]
  },
  toSerializable: ({ functionId }) => ({ functionId }),
  fromSerializable: ({ functionId }) => {
    const fn = async (opts: any, signal: any): Promise<any> => {
      const serverFn = await getServerFnById(functionId)
      const result = await serverFn(opts ?? {}, signal)
      return result.result
    }
    return createServerRpc(functionId, fn)
  },
})
