import { TSS_SERVER_FUNCTION } from '../constants'
import { serverFnFetcher } from './serverFnFetcher'

// make sure this get's hoisted
// eslint-disable-next-line no-var
var baseUrl: string
function sanitizeBase(base: string) {
  return base.replace(/^\/|\/$/g, '')
}

export function createClientRpc(functionId: string) {
  if (!baseUrl) {
    const sanitizedAppBase = sanitizeBase(process.env.TSS_APP_BASE || '/')
    const sanitizedServerBase = sanitizeBase(process.env.TSS_SERVER_FN_BASE!)
    baseUrl = `${sanitizedAppBase ? `/${sanitizedAppBase}` : ''}/${sanitizedServerBase}/`
  }
  const url = baseUrl + functionId

  const clientFn = (...args: Array<any>) => {
    return serverFnFetcher(url, args, fetch)
  }

  return Object.assign(clientFn, {
    url,
    functionId,
    [TSS_SERVER_FUNCTION]: true,
  })
}
