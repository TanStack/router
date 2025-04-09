/// <reference types="node" />
import { serverFnFetcher } from '@tanstack/start-server-functions-fetcher'
import { mergeHeaders } from '@tanstack/start-client-core'
import { getEvent, getHeaders } from '@tanstack/start-server-core'
import type { CreateRpcFn } from '@tanstack/server-functions-plugin'

function sanitizeBase(base: string) {
  return base.replace(/^\/|\/$/g, '')
}

export const createSsrRpc: CreateRpcFn = (functionId, serverBase) => {
  const url = `/${sanitizeBase(serverBase)}/${functionId}`

  const ssrFn = (...args: Array<any>) => {
    return serverFnFetcher(url, args, async (url, requestInit) => {
      // pass on the headers from the document request to the server function fetch
      requestInit.headers = mergeHeaders(getHeaders(), requestInit.headers)
      // @ts-expect-error The $fetch.native method is not typed yet
      const res: Response = await $fetch.native(url, requestInit)
      const event = getEvent()
      const mergedHeaders = mergeHeaders(
        res.headers,
        (event as any).___ssrRpcResponseHeaders,
      )

      // any response headers set in the server function need to be set on the document response
      // we attach the headers to the event so we can later set them
      ;(event as any).___ssrRpcResponseHeaders = mergedHeaders
      return res
    })
  }

  return Object.assign(ssrFn, {
    url,
    functionId,
  })
}
