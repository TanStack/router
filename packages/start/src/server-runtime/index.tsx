// import { getBaseUrl } from '../client-runtime/getBaseUrl'
import type { CreateRpcFn } from '@tanstack/start/server-functions-plugin'

export const createServerRpc: CreateRpcFn = (
  fn: any,
  filename: string,
  functionId: string,
) => {
  // const functionUrl = getBaseUrl('http://localhost:3000', id, name)
  const functionUrl = 'https://localhost:3000'

  return Object.assign(fn, {
    url: functionUrl,
    filename,
    functionId,
  })
}
