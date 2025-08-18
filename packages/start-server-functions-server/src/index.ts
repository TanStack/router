import invariant from 'tiny-invariant'
import type { CreateRpcFn } from '@tanstack/server-functions-plugin'

function sanitizeBase(base: string) {
  return base.replace(/^\/|\/$/g, '')
}

const sanitizedAppBase = sanitizeBase(process.env.TSS_APP_BASE || '/')
const sanitizedServerBase = sanitizeBase(process.env.TSS_SERVER_FN_BASE!)
const baseUrl = `${sanitizedAppBase ? `/${sanitizedAppBase}` : ''}/${sanitizedServerBase}/`

export const createServerRpc: CreateRpcFn = (functionId, splitImportFn) => {
  invariant(
    splitImportFn,
    '🚨splitImportFn required for the server functions server runtime, but was not provided.',
  )

  const url = baseUrl + functionId

  return Object.assign(splitImportFn, {
    url,
    functionId,
  })
}
