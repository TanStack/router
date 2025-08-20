import { TSS_SERVER_FUNCTION } from '@tanstack/start-client-core'
import invariant from 'tiny-invariant'

let baseUrl: string
function sanitizeBase(base: string) {
  return base.replace(/^\/|\/$/g, '')
}

export const createServerRpc = (
  functionId: string,
  splitImportFn: (...args: any) => any,
) => {
  if (!baseUrl) {
    const sanitizedAppBase = sanitizeBase(process.env.TSS_APP_BASE || '/')
    const sanitizedServerBase = sanitizeBase(process.env.TSS_SERVER_FN_BASE!)
    baseUrl = `${sanitizedAppBase ? `/${sanitizedAppBase}` : ''}/${sanitizedServerBase}/`
  }
  invariant(
    splitImportFn,
    '🚨splitImportFn required for the server functions server runtime, but was not provided.',
  )

  const url = baseUrl + functionId

  return Object.assign(splitImportFn, {
    url,
    functionId,
    [TSS_SERVER_FUNCTION]: true,
  })
}
