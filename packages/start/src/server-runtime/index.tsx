// import { getBaseUrl } from '../client-runtime/getBaseUrl'
import type { CreateRpcFn } from '@tanstack/server-functions-plugin'

export const createServerRpc: CreateRpcFn = (opts) => {
  // const functionUrl = getBaseUrl('http://localhost:3000', id, name)
  const functionUrl = 'https://localhost:3000'

  return Object.assign(opts.fn, {
    url: functionUrl,
    filename: opts.filename,
    functionId: opts.functionId,
  })
}
