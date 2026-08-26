// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./tanstack-start.d.ts" />

import { getRequestEvent } from '@solidjs/web'
import { createServerReference } from '@solidjs/web/server-functions/server'
import { TSS_SERVER_FUNCTION } from '@tanstack/start-client-core'
import { SOLID_SERVER_REFERENCE } from './server-rpc'
import type { ClientFnMeta } from '@tanstack/start-client-core'
import type { SolidRegisteredServerFn } from './server-rpc'
import { getServerFnById } from '#tanstack-start-server-fn-resolver'

export const createSsrRpc = (functionId: string) => {
  const url = process.env.TSS_SERVER_FN_BASE + functionId
  const serverFnMeta: ClientFnMeta = { id: functionId }

  let serverFnPromise:
    | Promise<
        ((...args: Array<any>) => Promise<any>) | ((...args: Array<any>) => any)
      >
    | undefined

  const getServerFn = async () => {
    serverFnPromise ??= getServerFnById(functionId, {
      origin: 'server',
    }).then((serverFn) => {
      const solidReference = (serverFn as SolidRegisteredServerFn)[
        SOLID_SERVER_REFERENCE
      ]

      if (solidReference && getRequestEvent()) {
        return createServerReference(solidReference)
      }

      return serverFn
    })

    return await serverFnPromise
  }

  const fn = async (...args: Array<any>): Promise<any> => {
    const serverFn = await getServerFn()
    return await serverFn(...args)
  }

  return Object.assign(fn, {
    url,
    serverFnMeta,
    [TSS_SERVER_FUNCTION]: true,
  })
}
