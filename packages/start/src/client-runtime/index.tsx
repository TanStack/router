import { fetcher } from './fetcher'
import { getBaseUrl } from './getBaseUrl'
import type { ServerFn } from '../client/createServerFn'

export function createServerReference<TPayload, TResponse>(
  _fn: ServerFn<TPayload, TResponse>,
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
