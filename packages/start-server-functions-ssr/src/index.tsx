import { serverFnFetcher } from '@tanstack/start-server-functions-fetcher'
import { mergeHeaders } from '@tanstack/start-client'
import { getHeaders } from '@tanstack/start-server'
import type { CreateRpcFn } from '@tanstack/server-functions-plugin'

function sanitizeBase(base: string) {
  return base.replace(/^\/|\/$/g, '')
}

export const createSsrRpc: CreateRpcFn = (functionId, serverBase) => {
  const url = `/${sanitizeBase(serverBase)}/${functionId}`

  const ssrFn = (...args: Array<any>) => {
    return serverFnFetcher(url, args, async (url, requestInit) => {
      // NOTE: Not sure if Nitro should handle this or if Vinxi was handling
      // it for us, but not all headers were being sent with the request
      // from here to the server handler, so we set them manually here.
      requestInit.headers = mergeHeaders(getHeaders(), requestInit.headers)
      // @ts-expect-error The $fetch.native method is not typed yet
      return $fetch.native(url, requestInit)
    })
  }

  return Object.assign(ssrFn, {
    url,
    functionId,
  })
}
