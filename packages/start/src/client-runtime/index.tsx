import { fetcher } from './fetcher'
import { getBaseUrl } from './getBaseUrl'
import type { FetchFn } from '../client/createServerFn'

export function createServerReference<TPayload, TResponse>(
  _fn: FetchFn<TPayload, TResponse>,
  id: string,
  name: string,
) {
  // let base = getBaseUrl(import.meta.env.SERVER_BASE_URL, id, name)
  const base = getBaseUrl(window.location.origin, id, name)

  const proxyFn = (...args: Array<any>) => fetcher(base, args, fetch)

  return Object.assign(proxyFn, {
    url: base,
  })
}

export { fetcher }
