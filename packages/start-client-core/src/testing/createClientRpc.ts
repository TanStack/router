import { TSS_SERVER_FUNCTION } from '../constants'
import { callServerFnMock, registerClientRpc } from './serverFnMocks'
import type { ClientFnMeta } from '../constants'

/**
 * The `createClientRpc` of a test run. The one of the app sends the call to
 * the server (`../client-rpc/createClientRpc`). A client test has no server,
 * so this one passes the call to the mock that `mockServerFn` registered.
 */
export function createClientRpc(functionId: string) {
  const url = process.env.TSS_SERVER_FN_BASE + functionId
  const serverFnMeta: ClientFnMeta = { id: functionId }
  registerClientRpc(functionId)

  const clientFn = (...args: Array<any>) => {
    return callServerFnMock(functionId, args[0])
  }

  return Object.assign(clientFn, {
    url,
    serverFnMeta,
    [TSS_SERVER_FUNCTION]: true,
  })
}
