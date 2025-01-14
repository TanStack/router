import invariant from 'tiny-invariant'
import { serverFnFetcher } from '../client'
import type { CreateSsrRpcFn } from '@tanstack/server-functions-plugin'
import 'vinxi/http'

const serverBase = process.env.TSS_SERVER_FN_BASE

function sanitizeBase(base: string) {
  return base.replace(/^\/|\/$/g, '')
}

export const createSsrRpc: CreateSsrRpcFn = (functionId) => {
  invariant(
    serverBase,
    '🚨A process.env.TSS_SERVER_FN_BASE env variable is required for the server functions ssr runtime, but was not provided.',
  )

  const url = `/${sanitizeBase(serverBase)}/${functionId}`

  const ssrFn = (...args: Array<any>) => {
    return serverFnFetcher(
      url,
      args,
      // @ts-expect-error The $fetch.native method is not typed yet
      $fetch.native,
    )
  }

  return Object.assign(ssrFn, {
    url,
    functionId,
  })
}
