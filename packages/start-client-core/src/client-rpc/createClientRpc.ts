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

/** The key of a stub's gate token on its RPC (`createGatedClientServerFn`). */
const gateTokenKey = /* @__PURE__ */ Symbol()

/**
 * `createClientServerFn` of a build with a custom `generateFunctionId`: the
 * stub also passes its gate token, a compile-only spelling the build looks
 * for in the client's emitted code to tell which server fns the client
 * calls (a custom id is any text). Stored on the RPC, non-enumerable (no
 * spread, serializer or request sees it), so that a minifier keeps it with
 * the stub: never read.
 */
export const createGatedClientServerFn = <TFn>(
  functionId: string,
  builder: { handler: (rpc: ReturnType<typeof createClientRpc>) => TFn },
  token: string,
): TFn => {
  const rpc = createClientRpc(functionId)
  Object.defineProperty(rpc, gateTokenKey, { value: token })
  return builder.handler(rpc)
}
