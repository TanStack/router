import { hydrate } from '@tanstack/router-core/ssr/client'

import { ServerFunctionSerializationAdapter } from './serializer/ServerFunctionSerializationAdapter'
import type { AnyRouter, AnySerializationAdapter } from '@tanstack/router-core'

export async function hydrateStart(): Promise<AnyRouter> {
  const startEntry = await import('tanstack-start-entry')
  const router = await startEntry.getRouter()

  let serializationAdapters: Array<AnySerializationAdapter>
  if (startEntry.getStart) {
    const start = await startEntry.getStart()
    window.__TSS_START_INSTANCE__ = start
    serializationAdapters = start.serializationAdapters
  } else {
    serializationAdapters = []
    window.__TSS_START_INSTANCE__ = { serializationAdapters }
  }

  serializationAdapters.push(ServerFunctionSerializationAdapter)
  if (!router.state.matches.length) {
    await hydrate(router)
  }

  return router
}
