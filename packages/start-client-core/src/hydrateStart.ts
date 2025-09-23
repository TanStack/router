import { hydrate } from '@tanstack/router-core/ssr/client'

import { ServerFunctionSerializationAdapter } from './serializer/ServerFunctionSerializationAdapter'
import type { AnyRouter, AnySerializationAdapter } from '@tanstack/router-core'
import * as startEntry from '#tanstack-start-entry'

export async function hydrateStart(): Promise<AnyRouter> {
  const router = await startEntry.getRouter()

  let serializationAdapters: Array<AnySerializationAdapter>
  if (startEntry.getStart) {
    const start = await startEntry.getStart()
    window.__TSS_START_INSTANCE__ = start
    serializationAdapters = start.serializationAdapters
    router.options.defaultSsr = start.defaultSsr
  } else {
    serializationAdapters = []
    window.__TSS_START_INSTANCE__ = { serializationAdapters }
  }

  serializationAdapters.push(ServerFunctionSerializationAdapter)
  router.options.serializationAdapters = serializationAdapters

  if (!router.state.matches.length) {
    await hydrate(router)
  }

  return router
}
