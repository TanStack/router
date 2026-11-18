import { TSS_SERVER_FUNCTION } from '../constants'
import { getStartOptions } from '../getStartOptions'
import { serverFnFetcher } from './serverFnFetcher'
import type { ClientFnMeta } from '../constants'

export function createClientRpc(functionId: string) {
  const url = process.env.TSS_SERVER_FN_BASE + functionId
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

/**
 * The client compile's stub of a server fn, `builder.handler(rpc)` (the
 * builder: the user's chain without its handler) as one call of ours, which
 * the compile marks pure: a bundler drops an unused server fn's stub and its
 * id, and keeps what the chain, an argument, runs. (Apart from
 * `createClientRpc`, which every client imports, so that an app without
 * server fns doesn't carry it.)
 */
export const createClientServerFn = <TFn>(
  functionId: string,
  builder: { handler: (rpc: ReturnType<typeof createClientRpc>) => TFn },
): TFn => builder.handler(createClientRpc(functionId))
