import * as Solid from 'solid-js/web'
import { isbot } from 'isbot'
import {
  createSsrStreamResponse,
  makeSsrSerovalPlugin,
  transformReadableStreamWithRouter,
  waitForReason,
} from '@tanstack/router-core/ssr/server'
import type { JSXElement } from 'solid-js'
import type { ReadableStream } from 'node:stream/web'
import type { AnyRouter } from '@tanstack/router-core'

export const renderRouterToStream = async ({
  request,
  router,
  responseHeaders,
  children,
}: {
  request: Request
  router: AnyRouter
  responseHeaders: Headers
  children: () => JSXElement
}) => {
  const signal = request.signal
  if (signal.aborted) {
    router.serverSsr?.cleanup()
    throw signal.reason
  }

  const bot = isbot(request.headers.get('User-Agent'))
  let stream: ReturnType<typeof Solid.renderToStream>
  try {
    const docType = Solid.ssr('<!DOCTYPE html>')
    const serializationAdapters = router.options.serializationAdapters
    const serovalPlugins = serializationAdapters?.map((adapter) =>
      makeSsrSerovalPlugin(adapter, { didRun: false }),
    )

    stream = Solid.renderToStream(
      () => (
        <>
          {docType}
          {children()}
        </>
      ),
      {
        nonce: router.options.ssr?.nonce,
        plugins: serovalPlugins,
      } as any,
    )
  } catch (error) {
    router.serverSsr?.cleanup()
    throw error
  }

  if (signal.aborted) {
    router.serverSsr?.cleanup()
    throw signal.reason
  }

  if (bot) {
    try {
      await waitForReason(stream as unknown, signal)
    } catch (error) {
      router.serverSsr?.cleanup()
      throw error
    }
  }

  const { writable, readable } = new TransformStream()

  // Solid's `pipeTo(w)` takes a single arg (no signal overload) and locks
  // `w` via `w.getWriter()`. To still own the lifecycle we hand Solid a
  // proxy WritableStream that forwards into an inner writer we control on
  // the real TransformStream writable. Aborting the inner writer errors
  // the underlying readable (which our router transform reads from),
  // surfacing the cancel through the response pipeline.
  //
  // Solid does not expose a disposal handle for unresolved renderer work.
  // See router-core's `STREAMING.md` for this accepted limitation.
  const innerWriter = writable.getWriter()
  let writerDone = false
  const releaseWriter = () => {
    try {
      innerWriter.releaseLock()
    } catch {
      // already released / errored
    }
  }
  const abortSolidPipe = (reason?: unknown) => {
    if (writerDone) {
      return
    }
    writerDone = true
    void innerWriter
      .abort(reason)
      .catch(() => {})
      .finally(releaseWriter)
  }

  const solidWritable = new WritableStream({
    write(chunk) {
      return innerWriter.write(chunk)
    },
    close() {
      writerDone = true
      return innerWriter.close().finally(releaseWriter)
    },
    abort(reason) {
      writerDone = true
      return innerWriter.abort(reason).finally(releaseWriter)
    },
  })

  // The server export returns Promise<void>. Solid's client declaration
  // returns void, and this file is also checked under that export condition.
  void Promise.resolve(stream.pipeTo(solidWritable)).catch((error: unknown) => {
    if (!writerDone) {
      console.error('Error in Solid render stream:', error)
      abortSolidPipe(error)
    }
    router.serverSsr?.cleanup()
  })

  const responseStream = transformReadableStreamWithRouter(
    router,
    readable as unknown as ReadableStream,
    {
      rendererSafePoint: 'record-end',
      signal,
      onAbort: abortSolidPipe,
    },
  )
  return createSsrStreamResponse(
    router,
    new Response(responseStream as any, {
      status:
        router._serverResult?.type === 'render'
          ? router._serverResult.status
          : 200,
      headers: responseHeaders,
    }),
  )
}
