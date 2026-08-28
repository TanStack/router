import {
  GET,
  configureServerFunctionsClient,
  createServerReference,
  invoke,
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
  // No explicit base url: with one, the reference fetches that url verbatim
  // (no id segment), but the rc.4 server resolves the function id from the
  // url pathname. Let the reference derive `endpoint + id` from the
  // configured endpoint instead.
  const solidReference = createServerReference(functionId, undefined)
  const solidGetReference = GET(solidReference)

  const clientFn = (...args: Array<any>) => {
    const reference =
      args[0]?.method === 'GET' ? solidGetReference : solidReference
    // Per-call invocation options (the AbortSignal) ride Solid's invocation
    // channel, not the serialized payload — encodeSolidStartPayload strips
    // them from the wire arguments.
    const signal: AbortSignal | undefined = args[0]?.signal
    const encodedArgs = encodeSolidStartPayload(args)
    if (signal) {
      return invoke(reference, { signal }, ...encodedArgs)
    }
    return reference(...encodedArgs)
  }

  return Object.assign(clientFn, {
    url,
    serverFnMeta,
    [TSS_SERVER_FUNCTION]: true,
  })
}
