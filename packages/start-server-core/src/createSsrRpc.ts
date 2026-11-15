import { TSS_SERVER_FUNCTION } from '@tanstack/start-client-core'
import { getServerFnById } from './getServerFnById'
import type {
  ClientFnMeta,
  FetcherBase,
  Method,
} from '@tanstack/start-client-core'

export const createSsrRpc = (functionId: string) => {
  const url = process.env.TSS_SERVER_FN_BASE + functionId
  const serverFnMeta: ClientFnMeta = { id: functionId }

  const fn = async (...args: Array<any>): Promise<any> => {
    const serverFn = await getServerFnById(functionId, { origin: 'server' })
    return serverFn(...args)
  }

  return Object.assign(fn, {
    url,
    serverFnMeta,
    [TSS_SERVER_FUNCTION]: true,
  })
}

/** A server fn as a split chunk's stub forwards to it: callable, with its server phase. */
type ServerFnInstance = FetcherBase & ((...args: Array<any>) => Promise<any>)

/**
 * A split chunk's server fn when the file's lazy server module holds it
 * (R158 rule 2): the chunk does not build the server fn's chain; a call
 * loads the lazy module and calls the server fn itself, so its middleware,
 * validator and handler run in their one instance. The id, the URL and the
 * method are literals, the synchronous surface of a server fn
 * (`FetcherBase`); `__executeServer` forwards to the instance's.
 */
export const createSsrFnStub = (
  functionId: string,
  method: Method,
  load: () => Promise<ServerFnInstance>,
): ServerFnInstance & { serverFnMeta: ClientFnMeta } => {
  const url = process.env.TSS_SERVER_FN_BASE + functionId
  const serverFnMeta: ClientFnMeta = { id: functionId }

  const fn = async (...args: Array<any>): Promise<any> => {
    const serverFn = await load()
    return serverFn(...args)
  }

  return Object.assign(fn, {
    url,
    serverFnMeta,
    method,
    [TSS_SERVER_FUNCTION]: true as const,
    __executeServer: async (
      opts: Parameters<FetcherBase['__executeServer']>[0],
    ) => (await load()).__executeServer(opts),
  })
}
