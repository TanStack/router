import invariant from 'tiny-invariant'
import { serverFnFetcher } from '@tanstack/start-server-functions-fetcher'
import type { CreateClientRpcFn } from '@tanstack/server-functions-plugin'

const serverBase = process.env.TSS_SERVER_FN_BASE

function sanitizeBase(base: string) {
  return base.replace(/^\/|\/$/g, '')
}

export const createClientRpc: CreateClientRpcFn = (functionId) => {
  invariant(
    serverBase,
    '🚨A process.env.TSS_SERVER_FN_BASE env variable is required for the server functions client runtime, but was not provided.',
  )

  const url = `/${sanitizeBase(serverBase)}/${functionId}`

  const clientFn = (...args: Array<any>) => {
    return serverFnFetcher(url, args, (url, requestInit) =>
      fetch(url, requestInit),
    )
  }

  return Object.assign(clientFn, {
    url,
    functionId,
  })
}
