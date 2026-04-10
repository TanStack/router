import { TSS_SERVER_FUNCTION } from '@tanstack/start-client-core'
import type { ServerFnMeta } from '@tanstack/start-client-core'

export const createServerRpc = (
  serverFnMeta: ServerFnMeta,
  splitImportFn: (...args: any) => any,
): ((...args: any) => any) & {
  url: string
  serverFnMeta: ServerFnMeta
  [k: symbol]: boolean
} => {
  const url = process.env.TSS_SERVER_FN_BASE + serverFnMeta.id

  return Object.assign(splitImportFn, {
    url,
    serverFnMeta,
    [TSS_SERVER_FUNCTION]: true,
  })
}
