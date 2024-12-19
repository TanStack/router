import { fetcher } from './fetcher'
import { getBaseUrl } from './getBaseUrl'
import type { CreateRpcFn } from '@tanstack/server-functions-plugin'

export const createClientRpc: CreateRpcFn = (opts) => {
  const base = getBaseUrl(
    window.location.origin,
    opts.filename,
    opts.functionId,
  )

  const fn = (...args: Array<any>) => fetcher(base, args, fetch)

  return Object.assign(fn, {
    url: base,
    filename: opts.filename,
    functionId: opts.functionId,
  })
}

export { fetcher }
