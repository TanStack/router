import { hydrate } from '@tanstack/router-core/ssr/client'
import {
  trimPathRight,
} from '@tanstack/router-core'

import { ServerFunctionSerializationAdapter } from './ServerFunctionSerializationAdapter'
import type { AnyStartInstanceOptions } from '../createStart'
import type { AnyRouter, AnySerializationAdapter } from '@tanstack/router-core'
// eslint-disable-next-line import/no-duplicates,import/order
import { getRouter } from '#tanstack-router-entry'
// eslint-disable-next-line import/no-duplicates,import/order
import { startInstance } from '#tanstack-start-entry'

declare global {
  interface Window {
    __TSS_SPA_SHELL__?: boolean
  }
}

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
    if (
      window.__TSS_SPA_SHELL__ &&
      trimPathRight(window.location.pathname) !==
        trimPathRight(router.options.basepath || '/')
    ) {
      // If we are loading the SPA shell (index.html) and the path is not the root,
      // it means we are in a fallback scenario (e.g. Cloudflare SPA fallback).
      // The server-rendered content (Shell) will not match the client-side expected content (Deep Link).
      // We skip hydration and let the RouterProvider mount the router freshly (Client Render).
    } else {
      await hydrate(router)
    }
  }

  return router
}
