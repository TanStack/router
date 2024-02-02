import { FetchFn } from '@tanstack/react-router'
import { getBaseUrl } from './client-runtime'
import { fetcher } from './server-fns/fetcher'
import { handleRequest } from './server-fns/handler'

export function createServerReference<TPayload, TResponse>(
  _fn: FetchFn<TPayload, TResponse>,
  id: string,
  name: string,
) {
  // let base = getBaseUrl(import.meta.env.SERVER_BASE_URL, id, name)
  let base = getBaseUrl('http://localhost:3000', id, name)

  const proxyFn = (...args: any[]) => fetcher(base, args, handleRequest)

  return Object.assign(proxyFn, {
    url: base,
  })
}
