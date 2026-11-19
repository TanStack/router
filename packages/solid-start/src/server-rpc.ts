import {
  GET,
  createServerReference,
  registerServerReference,
} from '@solidjs/web/server-functions/server'
import { TSS_SERVER_FUNCTION } from '@tanstack/start-client-core'
import { decodeSolidStartPayload } from './solid-rpc-payload'
import type { ServerFnMeta } from '@tanstack/start-client-core'
import type { ServerFunctionReference } from '@solidjs/web/server-functions/server'

export const SOLID_SERVER_REFERENCE = Symbol.for(
  'tanstack.solid-start.server-reference',
)

export type SolidRegisteredServerFn = {
  [SOLID_SERVER_REFERENCE]?: ServerFunctionReference
}

export const createServerRpc = (
  serverFnMeta: ServerFnMeta,
  splitImportFn: (...args: Array<any>) => any,
) => {
  const url = process.env.TSS_SERVER_FN_BASE + serverFnMeta.id
  const solidServerFn = (...args: Array<any>) => {
    return splitImportFn(decodeSolidStartPayload(args))
  }
  const reference = registerServerReference(
    serverFnMeta.id,
    solidServerFn,
    serverFnMeta.name,
  )
  const solidReference = createServerReference(reference)
  let method = (splitImportFn as typeof splitImportFn & { method?: string })
    .method

  Object.defineProperty(splitImportFn, 'method', {
    configurable: true,
    enumerable: true,
    get: () => method,
    set: (nextMethod) => {
      method = nextMethod
      if (nextMethod === 'GET') {
        GET(solidReference)
      }
    },
  })

  return Object.assign(splitImportFn, {
    url,
    serverFnMeta,
    [SOLID_SERVER_REFERENCE]: reference,
    [TSS_SERVER_FUNCTION]: true,
  })
}
