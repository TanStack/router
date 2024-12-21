import { fetcher } from './fetcher'
import { getBaseUrl } from './getBaseUrl'
import type { CreateClientRpcFn } from '@tanstack/directive-functions-plugin'

export const createClientRpc: CreateClientRpcFn = (functionId) => {
  const base = getBaseUrl(window.location.origin, functionId)

  const fn = (...args: Array<any>) => fetcher(base, args, fetch)

  return Object.assign(fn, {
    url: base,
    functionId,
  })
}

export { fetcher }
