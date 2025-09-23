import { createSerializationAdapter } from '@tanstack/router-core'
import { createClientRpc } from '../createClientRpc'
import { TSS_SERVER_FUNCTION } from '../constants'

export const ServerFunctionSerializationAdapter = createSerializationAdapter({
  key: '$TSS/serverfn',
  test: (v): v is { functionId: string } => {
    if (typeof v !== 'function') return false

    if (!(TSS_SERVER_FUNCTION in v)) return false

    return !!v[TSS_SERVER_FUNCTION]
  },
  toSerializable: ({ functionId }) => ({ functionId }),
  fromSerializable: ({ functionId }) => createClientRpc(functionId),
})
