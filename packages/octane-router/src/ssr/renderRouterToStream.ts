import { renderToReadableStream } from 'octane/server'
import { prerender } from 'octane/static'
import { isbot } from 'isbot'
import { createSsrStreamResponse } from '@tanstack/router-core/ssr/server'
import { finalizeBufferedHtml } from './renderRouterToString'
import type { ComponentBody } from 'octane'
import type { StreamInjectionSource } from 'octane/server'
import type { AnyRouter } from '@tanstack/router-core'

type RouterApp = ComponentBody<{ router: AnyRouter }>
type ServerComponent = Parameters<typeof renderToReadableStream>[0]

// Octane owns document streaming and merges the router data stream through its
// native injection API. This keeps Suspense segments streaming out of order and
// avoids buffering the document tail in router-core's byte-level HTML transform.
const SERIALIZATION_TIMEOUT_MS = 60_000

export async function renderRouterToStream({
  request,
  router,
  responseHeaders,
  App,
}: {
  request: Request
  router: AnyRouter
  responseHeaders: Headers
  App: RouterApp
}) {
  if (isbot(request.headers.get('User-Agent'))) {
    return renderRouterForBot({ request, router, responseHeaders, App })
  }

  const serverSsr = router.serverSsr
  if (!serverSsr) {
    throw new Error('Invariant failed: router.serverSsr is required')
  }

  const renderController = new AbortController()
  const onRequestAbort = () => renderController.abort(request.signal.reason)
  if (request.signal.aborted) {
    onRequestAbort()
  } else {
    request.signal.addEventListener('abort', onRequestAbort, { once: true })
    serverSsr.onCleanup(() => {
      request.signal.removeEventListener('abort', onRequestAbort)
    })
  }

  let serializationTimeout: ReturnType<typeof setTimeout> | undefined
  let stopSerializationListener: (() => void) | undefined
  let settleDone!: () => void
  let failDone!: (reason: unknown) => void
  const done = new Promise<void>((resolve, reject) => {
    settleDone = resolve
    failDone = reject
  })

  if (serverSsr.isSerializationFinished()) {
    settleDone()
  } else {
    stopSerializationListener = serverSsr.onSerializationFinished(settleDone)
  }

  const releaseInjection = () => {
    if (serializationTimeout !== undefined) {
      clearTimeout(serializationTimeout)
      serializationTimeout = undefined
    }
    stopSerializationListener?.()
    stopSerializationListener = undefined
  }

  const injection: StreamInjectionSource = {
    take: () => serverSsr.takeBufferedHtml() ?? '',
    subscribe(notify) {
      serverSsr.liftScriptBarrier()
      return serverSsr.onInjectedHtml(notify)
    },
    done,
    renderComplete() {
      serverSsr.setRenderFinished()
      if (
        !serverSsr.isSerializationFinished() &&
        serializationTimeout === undefined
      ) {
        serializationTimeout = setTimeout(() => {
          failDone(new Error('Serialization timeout after app render finished'))
        }, SERIALIZATION_TIMEOUT_MS)
      }
    },
  }

  try {
    const stream = await renderToReadableStream(
      App as unknown as ServerComponent,
      { router },
      {
        signal: renderController.signal,
        nonce: router.options.ssr?.nonce,
        injection,
        onError(error) {
          if (!isAbortError(request, error)) {
            console.error('Error in renderToReadableStream:', error)
          }
        },
      },
    )

    // allReady settles for every terminal stream state, including cancellation.
    stream.allReady.then(
      () => {
        releaseInjection()
        serverSsr.cleanup()
      },
      () => {
        releaseInjection()
        serverSsr.cleanup()
      },
    )

    return createSsrStreamResponse(
      router,
      new Response(stream as unknown as BodyInit, {
        status: router.stores.statusCode.get(),
        headers: responseHeaders,
      }),
    )
  } catch (error) {
    renderController.abort(error)
    releaseInjection()
    serverSsr.cleanup()
    throw error
  }
}

async function renderRouterForBot({
  request,
  router,
  responseHeaders,
  App,
}: {
  request: Request
  router: AnyRouter
  responseHeaders: Headers
  App: RouterApp
}) {
  try {
    const result = await prerender(
      App as unknown as Parameters<typeof prerender>[0],
      { router },
      {
        signal: request.signal,
        nonce: router.options.ssr?.nonce,
        onError(error) {
          if (!isAbortError(request, error)) {
            console.error('Error in prerender:', error)
          }
        },
      },
    )
    router.serverSsr!.setRenderFinished()

    return new Response(
      finalizeBufferedHtml(
        result.html,
        result.css,
        router.serverSsr!.takeBufferedHtml(),
      ),
      {
        status: router.stores.statusCode.get(),
        headers: responseHeaders,
      },
    )
  } finally {
    router.serverSsr?.cleanup()
  }
}

function isAbortError(request: Request, error: unknown) {
  return (
    (request.signal.aborted && error === request.signal.reason) ||
    (error instanceof Error && error.name === 'AbortError')
  )
}
