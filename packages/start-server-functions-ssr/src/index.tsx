import { serverFnFetcher } from '@tanstack/start-server-functions-fetcher'
import type { CreateRpcFn } from '@tanstack/server-functions-plugin'

function sanitizeBase(base: string) {
  return base.replace(/^\/|\/$/g, '')
}

export const createSsrRpc: CreateRpcFn = (functionId, serverBase) => {
  const url = `/${sanitizeBase(serverBase)}/${functionId}`

  const ssrFn = (...args: Array<any>) => {
    return serverFnFetcher(
      url,
      args,
      // @ts-expect-error The $fetch.native method is not typed yet
      $fetch.native,
    )
  }

  return Object.assign(ssrFn, {
    url,
    functionId,
  })
}
