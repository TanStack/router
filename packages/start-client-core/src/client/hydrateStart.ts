import { hydrate } from '@tanstack/router-core/ssr/client'

import { ServerFunctionSerializationAdapter } from './ServerFunctionSerializationAdapter'
import type { AnyStartInstanceOptions } from '../createStart'
import type { AnyRouter, AnySerializationAdapter } from '@tanstack/router-core'
import * as startEntry from '#tanstack-start-entry'
import { getRouter } from '#tanstack-router-entry'

export async function hydrateStart(): Promise<AnyRouter> {
  const router = await getRouter()

  let serializationAdapters: Array<AnySerializationAdapter>
  if (startEntry.startInstance) {
    const startOptions = await startEntry.startInstance.getOptions()
    startOptions.serializationAdapters = startOptions.serializationAdapters ?? []
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
  router.options.serializationAdapters = serializationAdapters

  if (!router.state.matches.length) {
    await hydrate(router)
  }

  return router
}
