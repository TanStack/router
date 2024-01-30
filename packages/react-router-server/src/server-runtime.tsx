import { FetchFn } from '@tanstack/react-router'
import { getBaseUrl, handleFetcherArgs } from './client-runtime'
import { handleServerRequest } from './server-handler'

export function createServerReference<TPayload, TResponse>(
  _fn: FetchFn<TPayload, TResponse>,
  id: string,
  name: string,
) {
  let base = getBaseUrl(import.meta.env.SERVER_BASE_URL, id, name)

  const proxyFn = (...args: any[]) =>
    handleFetcherArgs(base, args, handleServerRequest)

  return Object.assign(proxyFn, {
    url: base,
  })
}
