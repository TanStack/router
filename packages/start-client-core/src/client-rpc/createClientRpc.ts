import { TSS_SERVER_FUNCTION } from '../constants'
import { getStartOptions } from '../getStartOptions'
import { serverFnFetcher } from './serverFnFetcher'
import type { ClientFnMeta } from '../constants'

export function createClientRpc(functionId: string) {
  const serverFnBase =
    (typeof process !== 'undefined' && process.env?.TSS_SERVER_FN_BASE) ||
    (typeof import.meta !== 'undefined' &&
      (import.meta as any).env?.TSS_SERVER_FN_BASE) ||
    '/_serverFn/'
  const url = serverFnBase + functionId
  const serverFnMeta: ClientFnMeta = { id: functionId }

  const clientFn = (...args: Array<any>) => {
    const startFetch = getStartOptions()?.serverFns?.fetch
    return serverFnFetcher(url, args, startFetch ?? fetch)
  }

  return Object.assign(clientFn, {
    url,
    serverFnMeta,
    [TSS_SERVER_FUNCTION]: true,
  })
}
