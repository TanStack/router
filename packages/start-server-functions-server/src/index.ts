import invariant from 'tiny-invariant'
import type { CreateRpcFn } from '@tanstack/server-functions-plugin'

function sanitizeBase(base: string) {
  return base.replace(/^\/|\/$/g, '')
}

export const createServerRpc: CreateRpcFn = (
  functionId,
  serverBase,
  splitImportFn,
) => {
  invariant(
    splitImportFn,
    '🚨splitImportFn required for the server functions server runtime, but was not provided.',
  )

  const sanitizedAppBase = sanitizeBase(process.env.TSS_APP_BASE || '/')
  const sanitizedServerBase = sanitizeBase(serverBase)

  const url = `${sanitizedAppBase ? `/${sanitizedAppBase}` : ``}/${sanitizedServerBase}/${functionId}`

  return Object.assign(splitImportFn, {
    url,
    functionId,
  })
}
