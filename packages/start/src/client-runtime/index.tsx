import { fetcher } from './fetcher'
import { getBaseUrl } from './getBaseUrl'
import type { CreateRpcFn } from '@tanstack/start/server-functions-plugin'

export const createClientRpc: CreateRpcFn = (
  filename: string,
  functionId: string,
) => {
  const base = getBaseUrl(window.location.origin, filename, functionId)

  const fn = (...args: Array<any>) => fetcher(base, args, fetch)

  return Object.assign(fn, {
    url: base,
    filename,
    functionId,
  })
}

export { fetcher }
