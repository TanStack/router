import { hydrate } from '@tanstack/router-core/ssr/client'

import { ServerFunctionSerializationAdapter } from './ServerFunctionSerializationAdapter'
import type { AnyStartInstanceOptions } from '../createStart'
import type { AnyRouter, AnySerializationAdapter } from '@tanstack/router-core'
// eslint-disable-next-line import/no-duplicates,import/order
import { getRouter } from '#tanstack-router-entry'
// eslint-disable-next-line import/no-duplicates,import/order
import { startInstance } from '#tanstack-start-entry'

export async function hydrateStart(): Promise<AnyRouter> {
  const router = await getRouter()

  let serializationAdapters: Array<AnySerializationAdapter>
  if (startInstance) {
    const startOptions = await startInstance.getOptions()
    startOptions.serializationAdapters =
      startOptions.serializationAdapters ?? []
    window.__TSS_START_OPTIONS__ = startOptions as AnyStartInstanceOptions
    serializationAdapters = startOptions.serializationAdapters
    router.options.defaultSsr = startOptions.defaultSsr
  } else {
    serializationAdapters = []
    window.__TSS_START_OPTIONS__ = {
      serializationAdapters,
    } as AnyStartInstanceOptions
  }

  serializationAdapters.push(ServerFunctionSerializationAdapter)
  if (router.options.serializationAdapters) {
    serializationAdapters.push(...router.options.serializationAdapters)
  }

  router.update({
    basepath: process.env.TSS_ROUTER_BASEPATH,
    ...{ serializationAdapters },
  })
  if (!router.state.matches.length) {
    await hydrate(router)
  }

  return router
}
