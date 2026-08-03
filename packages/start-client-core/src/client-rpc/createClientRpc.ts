import { isPromise } from '@tanstack/router-core'
import { TSS_SERVER_FUNCTION } from '../constants'
import { initStartOptions } from '../getStartOptions'
import { serverFnFetcher } from './serverFnFetcher'
import type { ClientFnMeta } from '../constants'

export function createClientRpc(functionId: string) {
  const url = process.env.TSS_SERVER_FN_BASE + functionId

  const clientFn = (...args: Array<any>) => {
    const startOptions = initStartOptions()
    return isPromise(startOptions)
      ? startOptions.then((resolvedOptions) =>
          serverFnFetcher(url, args, resolvedOptions),
        )
      : serverFnFetcher(url, args, startOptions)
  }

  return Object.assign(clientFn, {
    url,
    serverFnMeta: { id: functionId } satisfies ClientFnMeta,
    [TSS_SERVER_FUNCTION]: true,
  })
}
