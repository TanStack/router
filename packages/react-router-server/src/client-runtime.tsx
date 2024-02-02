import { FetchFn } from '@tanstack/react-router'
import { fetcher } from './server-fns/fetcher'

export function getBaseUrl(base: string | undefined, id: string, name: string) {
  return `${base}/_server/?_serverFnId=${encodeURI(id)}&_serverFnName=${encodeURI(name)}`
}

export function createServerReference<TPayload, TResponse>(
  _fn: FetchFn<TPayload, TResponse>,
  id: string,
  name: string,
) {
  // let base = getBaseUrl(import.meta.env.SERVER_BASE_URL, id, name)
  let base = getBaseUrl(window.location.origin, id, name)

  const proxyFn = (...args: any[]) => fetcher(base, args, fetch)

  return Object.assign(proxyFn, {
    url: base,
  })
}
