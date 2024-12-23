import { serverFnFetcher } from './serverFnFetcher'
import type { CompiledFetcherFnOptions } from './createServerFn'

type ServerFnClient = {
  fetch: (
    opts: Omit<CompiledFetcherFnOptions, 'data'> & {
      data?: any
      functionId: string
    },
  ) => Promise<any>
}

export function createServerFnClient(clientOpts: {
  baseUrl: string
}): ServerFnClient {
  return {
    fetch: (fetchOpts) => {
      return serverFnFetcher(
        joinPaths(clientOpts.baseUrl, fetchOpts.functionId),
        [fetchOpts],
        fetch,
      )
    },
  }
}

function joinPaths(...paths: Array<string>) {
  const firstPath = paths[0] || ''
  const lastPath = paths[paths.length - 1] || ''
  const prefix = firstPath.startsWith('/') ? '/' : ''
  const suffix = lastPath.endsWith('/') ? '/' : ''

  return (
    prefix +
    paths.map((path) => path.replace(/(^\/+|\/+$)/g, '')).join('/') +
    suffix
  )
}
