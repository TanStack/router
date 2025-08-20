import { createSerializationAdapter } from '@tanstack/router-core'
import { createClientRpc } from '../createClientRpc'
import { TSS_SERVER_FUNCTION } from '../constants'

export const ServerFunctionSerializationAdapter = createSerializationAdapter({
  key: '$TSS/serverfn',
  test: (v): v is { functionId: string } => v[TSS_SERVER_FUNCTION],
  toSerializable: ({ functionId }) => ({ functionId }),
  fromSerializable: ({ functionId }) => createClientRpc(functionId),
})
