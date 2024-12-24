import { serverFnFetcher } from '../client'
import { getBaseUrl } from './getBaseUrl'
import type { CreateClientRpcFn } from '@tanstack/server-functions-plugin'

export const createClientRpc: CreateClientRpcFn = (functionId) => {
  const base = getBaseUrl(window.location.origin, functionId)

  const fn = (...args: Array<any>) => serverFnFetcher(base, args, fetch)

  return Object.assign(fn, {
    url: base,
    functionId,
  })
}

export { serverFnFetcher }
