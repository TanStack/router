import { hydrate } from '@tanstack/router-core/ssr/client'
import { getRouter } from '#tanstack-router-entry'
import { initStartOptions } from '../getStartOptions'
import type { AnyRouter } from '@tanstack/router-core'
import type { AnyStartInstanceOptions } from '../createStart'

type HotContext = {
  data?: Record<string, unknown>
  dispose?: (cb: (data: Record<string, unknown>) => void) => void
}

declare global {
  interface ImportMeta {
    hot?: HotContext
    webpackHot?: HotContext
  }
}

async function hydrateStart(): Promise<AnyRouter> {
  const router = await getRouter()
  const startOptions = (await initStartOptions()) as AnyStartInstanceOptions
  const serializationAdapters = startOptions.serializationAdapters

  if (router.options.serializationAdapters) {
    serializationAdapters.push(...router.options.serializationAdapters)
  }

  router.update({
    basepath: process.env.TSS_ROUTER_BASEPATH,
    ...{ serializationAdapters },
  })
  router.options.defaultSsr = startOptions.defaultSsr
  if (!router.stores.matchesId.get().length) {
    await hydrate(router)
  }

  return router
}

function hydrateStartWithHmr(): Promise<AnyRouter> {
  const hot = import.meta.hot ?? import.meta.webpackHot

  if (!hot) {
    return hydrateStart()
  }

  const key = 'tss-hydrate-start-promise'
  const hotData = (hot.data ??= {})
  let hydrationPromise = hotData[key] as Promise<AnyRouter> | undefined

  if (!hydrationPromise) {
    hydrationPromise = hydrateStart().catch((error) => {
      if (hotData[key] === hydrationPromise) {
        hotData[key] = undefined
      }

      throw error
    })

    hotData[key] = hydrationPromise
  }

  hot.dispose?.((data) => {
    data[key] = hotData[key]
  })

  return hydrationPromise
}

const exportedHydrateStart =
  process.env.NODE_ENV !== 'production' ? hydrateStartWithHmr : hydrateStart

export { exportedHydrateStart as hydrateStart }
