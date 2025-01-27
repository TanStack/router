import { serverFnFetcher } from '@tanstack/start-server-functions-fetcher'
import type { CreateRpcFn } from '@tanstack/server-functions-plugin'

function sanitizeBase(base: string) {
  return base.replace(/^\/|\/$/g, '')
}

export const createClientRpc: CreateRpcFn = (functionId, serverBase) => {
  const url = `/${sanitizeBase(serverBase)}/${functionId}`

  const clientFn = (...args: Array<any>) => {
    return serverFnFetcher(url, args, fetch)
  }

  return Object.assign(clientFn, {
    url,
    functionId,
  })
}
