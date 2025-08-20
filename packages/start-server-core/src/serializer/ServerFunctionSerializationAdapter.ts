import { createSerializationAdapter } from '@tanstack/router-core'
import { createServerRpc } from '../createServerRpc'
import { getServerFnById } from '../getServerFnById'

export const ServerFunctionSerializationAdapter = createSerializationAdapter({
  key: '$TSS/serverfn',
  test: (v): v is { functionId: string } =>
    typeof v == 'function' && 'functionId' in v,
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
