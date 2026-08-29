import {
  attachRouterServerSsrUtils,
  loadFlightTarget,
} from '@tanstack/solid-router/ssr/server'
import {
  getStartContext,
  runWithStartContext,
} from '@tanstack/start-storage-context'
import { createSolidStartFlightMatch } from './solid-rpc-flight'
import type {
  CollectFlightDataHook,
  ServerFunctionOutcome,
} from '@solidjs/web/server-functions/server'

export const collectSolidStartFlightData: CollectFlightDataHook = async (
  event,
  outcome,
) => {
  const href = getTargetHref(outcome)
  if (!href) {
    return undefined
  }

  const startContext = getStartContext({ throwIfNotFound: false })
  if (!startContext) {
    return undefined
  }

  const router = await startContext.getRouter()
  // Mirrors the flight request loadFlightTarget derives, so Start handlers
  // reading the start context observe the same target the router loads.
  const request = new Request(href, {
    headers: outcome.foldedHeaders,
    signal: outcome.request.signal,
  })

  let attachedServerSsr = false
  try {
    if (router.options.dehydrate && !router.serverSsr) {
      attachRouterServerSsrUtils({ router, manifest: undefined })
      attachedServerSsr = true
    }

    return await runWithStartContext(
      {
        ...startContext,
        handlerType: 'router',
        request,
      },
      () =>
        loadFlightTarget({
          router,
          event,
          outcome,
          href,
          collect: async () => {
            const dehydratedData = await router.options.dehydrate?.()
            router.serverSsr?.setRenderFinished()

            return {
              ...(dehydratedData === undefined ? {} : { dehydratedData }),
              href: request.url,
              matches: router.stores.matches
                .get()
                .map(createSolidStartFlightMatch),
            }
          },
        }),
    )
  } catch (error) {
    console.error('Unable to collect TanStack Start flight data', error)
    return undefined
  } finally {
    if (attachedServerSsr) {
      router.serverSsr?.cleanup()
    }
  }
}

function getTargetHref(outcome: ServerFunctionOutcome) {
  const redirectHref = getTanStackRedirectHref(outcome.value)
  const target = redirectHref
    ? new URL(
        redirectHref,
        outcome.request.headers.get('referer') ?? outcome.request.url,
      )
    : outcome.targetUrl
      ? new URL(outcome.targetUrl)
      : undefined

  if (!target || target.origin !== new URL(outcome.request.url).origin) {
    return undefined
  }
  return target.href
}

function getTanStackRedirectHref(value: unknown) {
  if (!isObject(value) || !isObject(value.error)) {
    return undefined
  }
  const error = value.error
  if (error.isSerializedRedirect !== true) {
    return undefined
  }
  if (typeof error.href === 'string') {
    return error.href
  }
  if (isObject(error.headers) && typeof error.headers.location === 'string') {
    return error.headers.location
  }
  return typeof error.to === 'string' ? error.to : undefined
}

function isObject(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object'
}
