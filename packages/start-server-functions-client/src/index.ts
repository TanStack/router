import { serverFnFetcher } from '@tanstack/start-server-functions-fetcher'
import type { CreateRpcFn } from '@tanstack/server-functions-plugin'

function sanitizeBase(base: string) {
  return base.replace(/^\/|\/$/g, '')
}

const sanitizedAppBase = sanitizeBase(process.env.TSS_APP_BASE || '/')
const sanitizedServerBase = sanitizeBase(process.env.TSS_SERVER_FN_BASE!)
const baseUrl = `${sanitizedAppBase ? `/${sanitizedAppBase}` : ''}/${sanitizedServerBase}/`

export const createClientRpc: CreateRpcFn = (functionId) => {
  const url = baseUrl + functionId

  const clientFn = (...args: Array<any>) => {
    return serverFnFetcher(url, args, fetch)
  }

  return Object.assign(clientFn, {
    url,
    functionId,
  })
}
