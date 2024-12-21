import { getBaseUrl } from '../client-runtime/getBaseUrl'
import type { CreateServerRpcFn } from '@tanstack/directive-functions-plugin'

const fakeHost = 'http://localhost:3000'

export const createServerRpc: CreateServerRpcFn = (
  functionId,
  splitImportFn,
) => {
  const functionUrl = getBaseUrl(fakeHost, functionId)

  return Object.assign(splitImportFn, {
    url: functionUrl.replace(fakeHost, ''),
    functionId,
  })
}
