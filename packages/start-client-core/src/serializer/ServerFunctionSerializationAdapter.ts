import { createSerializationAdapter } from '@tanstack/router-core'
import { createClientRpc } from '../createClientRpc'

export const ServerFunctionSerializationAdapter = createSerializationAdapter({
  key: '$TSS/serverfn',
  test: (v): v is { functionId: string } =>
    typeof v == 'function' && 'functionId' in v,
  toSerializable: ({ functionId }) => ({ functionId }),
  fromSerializable: ({ functionId }) => createClientRpc(functionId),
})
