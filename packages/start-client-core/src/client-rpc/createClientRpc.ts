import { TSS_SERVER_FUNCTION } from '../constants'
import { serverFnFetcher } from './serverFnFetcher'

export function createClientRpc(functionId: string) {
  const url = process.env.TSS_SERVER_FN_BASE + functionId

  const clientFn = (...args: Array<any>) => {
    return serverFnFetcher(url, args, fetch)
  }

  return Object.assign(clientFn, {
    url,
    functionId,
    [TSS_SERVER_FUNCTION]: true,
  })
}
