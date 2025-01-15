import invariant from 'tiny-invariant'
import type { CreateServerRpcFn } from '@tanstack/server-functions-plugin'

const serverBase = process.env.TSS_SERVER_FN_BASE

function sanitizeBase(base: string) {
  return base.replace(/^\/|\/$/g, '')
}

export function getFunctionUrl(functionId: string) {
  invariant(
    serverBase,
    '🚨A process.env.TSS_SERVER_FN_BASE env variable is required for the server functions ssr runtime, but was not provided.',
  )

  return `/${sanitizeBase(serverBase)}/${functionId}`
}

export const createServerRpc: CreateServerRpcFn = (
  functionId,
  splitImportFn,
) => {
  const url = getFunctionUrl(functionId)

  return Object.assign(splitImportFn, {
    url,
    functionId,
  })
}
