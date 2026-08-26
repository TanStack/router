import {
  GET,
  configureServerFunctionsClient,
  createServerReference,
} from '@solidjs/web/server-functions/client'
import { TSS_SERVER_FUNCTION } from '@tanstack/start-client-core'
import { encodeSolidStartPayload } from './solid-rpc-payload'
import { getSolidStartServerFunctionCodec } from './solid-rpc-codec'
import { subscribeSolidStartFlightData } from './solid-rpc-flight-client'
import type { ClientFnMeta } from '@tanstack/start-client-core'

export function createClientRpc(functionId: string) {
  subscribeSolidStartFlightData()
  const endpoint = process.env.TSS_SERVER_FN_BASE
  const url = endpoint + functionId
  const serverFnMeta: ClientFnMeta = { id: functionId }
  configureServerFunctionsClient({
    endpoint,
    codec: getSolidStartServerFunctionCodec(),
  })
  const solidReference = createServerReference(functionId, undefined, endpoint)
  const solidGetReference = GET(solidReference)

  const clientFn = (...args: Array<any>) => {
    const reference =
      args[0]?.method === 'GET' ? solidGetReference : solidReference
    return reference(...encodeSolidStartPayload(args))
  }

  return Object.assign(clientFn, {
    url,
    serverFnMeta,
    [TSS_SERVER_FUNCTION]: true,
  })
}
