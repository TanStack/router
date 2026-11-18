import { TSS_SERVER_FUNCTION } from '../constants'
import { getStartOptions } from '../getStartOptions'
import { serverFnFetcher } from './serverFnFetcher'
import type { ClientFnMeta } from '../constants'

/** The client's call of a server fn by HTTP (`createClientRpc(id)`). */
export type ClientRpc = ((
  ...args: Array<any>
) => ReturnType<typeof serverFnFetcher>) & {
  url: string
  serverFnMeta: ClientFnMeta
  [TSS_SERVER_FUNCTION]: true
}

/**
 * The client's call of the server fn `functionId`, by HTTP. Given a
 * builder, the server fn itself, `builder.handler(rpc)`: the client
 * compile's stub of a server fn passes the user's chain without its handler
 * (`createClientRpc(id, chain)`), one call of ours, marked pure, so a
 * bundler drops an unused server fn's stub and its id, and keeps what the
 * chain, an argument, runs.
 */
export function createClientRpc(functionId: string): ClientRpc
export function createClientRpc<TFn>(
  functionId: string,
  builder: { handler: (rpc: ClientRpc) => TFn },
): TFn
export function createClientRpc(
  functionId: string,
  builder?: { handler: (rpc: ClientRpc) => unknown },
) {
  const url = process.env.TSS_SERVER_FN_BASE + functionId
  const serverFnMeta: ClientFnMeta = { id: functionId }

  const clientFn = (...args: Array<any>) => {
    const startFetch = getStartOptions()?.serverFns?.fetch
    return serverFnFetcher(url, args, startFetch ?? fetch)
  }

  const rpc: ClientRpc = Object.assign(clientFn, {
    url,
    serverFnMeta,
    [TSS_SERVER_FUNCTION]: true as const,
  })
  return builder ? builder.handler(rpc) : rpc
}
