import * as Solid from '@solidjs/web'
import { isbot } from 'isbot'
import { createSsrStreamResponse } from '@tanstack/router-core/ssr/server'
import { makeSsrSerovalPlugin } from '@tanstack/router-core'
import clientAssetsManifest from './clientAssetsManifest'
import type { AnyRouter } from '@tanstack/router-core'
import type { JSX } from '@solidjs/web'

const noop = () => {}

// Matches TSR_SCRIPT_BARRIER_ID in router-core/src/ssr/constants.ts (and the
// Solid mirror in routerPayloadServer) — the id of the inline script tag
// <Scripts /> renders when it drains the buffered payload into the shell.
// Once that tag has been WRITTEN to the sink, later scripts may flow (the
// initial payload record must parse before any streamed follow-up records).
const SCRIPT_BARRIER_MARKER = '$tsr-stream-barrier'

// Mirrors the transform's serialization timeout: how long after the app
// render finishes we keep the response open waiting for router
// serialization (streamed loaderData promises) to settle.
const SERIALIZATION_TIMEOUT_MS = 60000

// Bot responses wait for the server renderer before streaming. If the request
// disconnects during that wait, unblock so the pipe can abort and clean up.
async function waitForReadyOrAbort(
  ready: Promise<unknown>,
  signal: AbortSignal,
) {
  let cleanup = noop
  try {
    await Promise.race([
      ready,
      new Promise<void>((resolve) => {
        const onAbort = () => resolve()
        cleanup = () => signal.removeEventListener('abort', onAbort)
        signal.addEventListener('abort', onAbort, { once: true })
        if (signal.aborted) resolve()
      }),
    ])
  } finally {
    cleanup()
  }
}

export const renderRouterToStream = async ({
  request,
  router,
  responseHeaders,
  children,
  manifest,
}: {
  request: Request
  router: AnyRouter
  responseHeaders: Headers
  children: () => JSX.Element
  manifest?: unknown
}) => {
  const { writable, readable } = new TransformStream()

  // Solid transfer note: by the time this renderer runs, serverSsr.dehydrate
  // (the Solid override — see routerPayloadServer) already serialized the
  // initial payload record into the Solid script buffer, so <Scripts />
  // drains it into the shell. Streamed loaderData resolutions keep emitting
  // records afterward; the override's serialization-finished signal gates the
  // stream close below through the same serverSsr members as before.

  const serializationAdapters =
    (router.options as any)?.serializationAdapters ||
    (router.options.ssr as any)?.serializationAdapters
  const serovalPlugins = serializationAdapters?.map((adapter: any) => {
    const plugin = makeSsrSerovalPlugin(adapter, { didRun: false })
    return plugin
  })

  const stream = Solid.renderToStream(() => children, {
    nonce: router.options.ssr?.nonce,
    plugins: serovalPlugins,
    // Prefer the bundler-provided client-assets bridge (module-keyed, the
    // shape Solid resolves lazy() assets from); the router's route-keyed
    // manifest is a last resort that cannot answer lazy module lookups.
    manifest: manifest ?? clientAssetsManifest ?? router.ssr?.manifest,
  } as any)

  // Solid's `pipeTo(w)` takes a single arg (no signal overload) and locks
  // `w` via `w.getWriter()`. To still own the lifecycle we hand Solid a
  // proxy WritableStream that forwards into an inner writer we control on
  // the real TransformStream writable. Aborting the inner writer errors
  // the underlying readable, surfacing the cancel through the response
  // pipeline.
  //
  // RESIDUAL RISK: solid-js@1.x does NOT expose a disposal hook on
  // `renderToStream`, and its internal write loop swallows writer
  // rejections (`writer.write(...).catch(() => {})` in
  // solid-js/web/dist/server.js). So aborting the inner writer stops
  // outbound bytes but does not terminate Solid's render continuation
  // if a Suspense/resource never resolves — those pending promise
  // continuations remain scheduled and can retain children/context/
  // request references via captured closures until natural completion
  // or process exit. The request-scoped router graph itself is released
  // by ServerSsr.cleanup() through the router stream lifecycle, so the leak
  // is bounded to whatever the user's Suspense/resource closures capture.
  // A hard upstream-abort guarantee would require a disposal API in solid-js.
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
    if (writerDone) return
    writerDone = true
    tsrSink.dispose()
    void innerWriter
      .abort(reason)
      .catch(() => {})
      .finally(releaseWriter)
    // The old transform released router SSR state on its internal error
    // paths; nobody else does when the response errors mid-consumption
    // (dispose() is only driven by request abort). Idempotent.
    try {
      router.serverSsr?.cleanup()
    } catch {}
  }

  // --- Router script sink ---------------------------------------------
  // The router's SSR channel (bootstrap + dehydrated payload + streamed
  // promise resolutions + the end marker) used to reach the response
  // through transformReadableStreamWithRouter: an HTML transform that
  // decoded every chunk, scanned for safe closing-tag boundaries, spliced
  // buffered scripts in, and held the `</body></html>` tail until router
  // serialization finished.
  //
  // Solid's own streaming protocol already appends late chunks (settled
  // boundaries, hydration data scripts) after the shell — which for a
  // full-document render means after `</html>`; HTML5 parsers reparent
  // trailing content into <body> and execute scripts in order. Router
  // scripts are the same class of content, so they ride the same writer
  // directly:
  //
  // - The shell payload is untouched: <Scripts /> drains the buffered
  //   bootstrap + initial payload into an inline tag during the render.
  // - Late scripts write straight to the inner writer as the serializer
  //   emits them (writer queuing keeps them ordered between Solid chunks;
  //   they can never split a chunk).
  // - The script barrier lifts when the chunk carrying the <Scripts /> tag
  //   has been written — detected by scanning chunks (only) until the
  //   marker id is seen, then scanning stops.
  // - The response closes when BOTH the Solid render completed AND router
  //   serialization finished, with the transform's 60s safety timeout.
  const serverSsr = router.serverSsr
  const textEncoder = new TextEncoder()
  const barrierDecoder = serverSsr ? new TextDecoder() : undefined
  // Carry the tail of the previous chunk so a marker split across two
  // chunks is still seen.
  let barrierScanTail = ''
  let barrierLifted = !serverSsr
  let solidDone = false
  let serializationFinished = !serverSsr
  let innerClosed = false
  let serializationTimeout: ReturnType<typeof setTimeout> | undefined
  const unsubscribes: Array<() => void> = []

  const tsrSink = {
    drain() {
      if (!serverSsr || innerClosed || writerDone) return
      const html = serverSsr.takeBufferedHtml()
      if (!html) return
      void innerWriter.write(textEncoder.encode(html)).catch(() => {})
    },
    scanForBarrier(chunk: unknown) {
      if (barrierLifted || !serverSsr) return
      let text: string | undefined
      if (typeof chunk === 'string') {
        text = chunk
      } else if (ArrayBuffer.isView(chunk)) {
        text = barrierDecoder!.decode(chunk as Uint8Array, { stream: true })
      }
      if (text === undefined) return
      const scan = barrierScanTail + text
      if (scan.includes(SCRIPT_BARRIER_MARKER)) {
        barrierLifted = true
        barrierScanTail = ''
        // Buffered post-shell scripts flow from here on (enqueue →
        // microtask → injectScript → onInjectedHtml → drain).
        serverSsr.liftScriptBarrier()
      } else {
        barrierScanTail = scan.slice(1 - SCRIPT_BARRIER_MARKER.length)
      }
    },
    maybeClose() {
      if (!solidDone || !serializationFinished || innerClosed || writerDone)
        return
      innerClosed = true
      this.dispose()
      this.drainRaw()
      writerDone = true
      void innerWriter
        .close()
        .catch(() => {})
        .finally(() => {
          releaseWriter()
          // Normal completion releases router SSR state, matching the
          // transform's end-of-stream cleanup. Idempotent under the
          // dispose()-driven cleanup of cancelled responses.
          try {
            serverSsr?.cleanup()
          } catch {}
        })
    },
    // drain() without the closed guard, for the final flush ahead of close.
    drainRaw() {
      if (!serverSsr) return
      const html = serverSsr.takeBufferedHtml()
      if (!html) return
      void innerWriter.write(textEncoder.encode(html)).catch(() => {})
    },
    dispose() {
      if (serializationTimeout !== undefined) {
        clearTimeout(serializationTimeout)
        serializationTimeout = undefined
      }
      for (const unsub of unsubscribes.splice(0)) {
        try {
          unsub()
        } catch {}
      }
    },
    onSolidDone() {
      solidDone = true
      if (!serverSsr) {
        this.maybeClose()
        return
      }
      try {
        // Lifts the barrier as a fallback (an app without <Scripts /> never
        // renders the marker) and flushes if serialization already finished.
        serverSsr.setRenderFinished()
      } catch {}
      serializationFinished =
        serializationFinished || serverSsr.isSerializationFinished()
      if (!serializationFinished && serializationTimeout === undefined) {
        serializationTimeout = setTimeout(() => {
          if (innerClosed || writerDone) return
          console.error('Serialization timeout after app render finished')
          abortSolidPipe(
            new Error('Serialization timeout after app render finished'),
          )
          try {
            serverSsr.cleanup()
          } catch {}
        }, SERIALIZATION_TIMEOUT_MS)
      }
      this.drain()
      this.maybeClose()
    },
  }

  if (serverSsr) {
    // Subscriptions before snapshots so events between the two are not lost.
    unsubscribes.push(
      serverSsr.onInjectedHtml(() => {
        tsrSink.drain()
      }),
      serverSsr.onSerializationFinished(() => {
        serializationFinished = true
        if (serializationTimeout !== undefined) {
          clearTimeout(serializationTimeout)
          serializationTimeout = undefined
        }
        tsrSink.drain()
        tsrSink.maybeClose()
      }),
    )
    serializationFinished = serverSsr.isSerializationFinished()
    tsrSink.drain()
  }

  const onRequestAbort = () => {
    abortSolidPipe(request.signal.reason)
  }

  // Wire request abort before the bot all-ready wait. Otherwise a disconnect
  // during `await stream` can leave this callback pending forever.
  if (request.signal.aborted) {
    onRequestAbort()
  } else {
    request.signal.addEventListener('abort', onRequestAbort, { once: true })
    router.serverSsr?.onCleanup(() => {
      request.signal.removeEventListener('abort', onRequestAbort)
    })
  }

  if (isbot(request.headers.get('User-Agent'))) {
    await waitForReadyOrAbort(
      Promise.resolve(stream as unknown),
      request.signal,
    )
  }

  const doctype = new TextEncoder().encode('<!DOCTYPE html>')
  let doctypeWritten = false

  const solidWritable = new WritableStream({
    write(chunk) {
      let out = chunk
      if (!doctypeWritten) {
        doctypeWritten = true
        if (ArrayBuffer.isView(chunk)) {
          const bytes = chunk as Uint8Array
          const merged = new Uint8Array(doctype.length + bytes.length)
          merged.set(doctype, 0)
          merged.set(bytes, doctype.length)
          out = merged
        }
      }
      const written = innerWriter.write(out)
      tsrSink.scanForBarrier(chunk)
      return written
    },
    close() {
      tsrSink.onSolidDone()
    },
    abort(reason) {
      writerDone = true
      tsrSink.dispose()
      return innerWriter.abort(reason).finally(releaseWriter)
    },
  })

  if (!request.signal.aborted) {
    try {
      void Promise.resolve(stream.pipeTo(solidWritable) as unknown).catch(
        (err: any) => {
          if (
            writerDone ||
            err?.name === 'AbortError' ||
            err?.code === 'ABORT_ERR'
          )
            return
          console.error('Error in Solid render stream:', err)
          abortSolidPipe(err)
        },
      )
    } catch (err: any) {
      if (err?.name !== 'AbortError' && err?.code !== 'ABORT_ERR') {
        console.error('Error in Solid render stream:', err)
      }
      abortSolidPipe(err)
    }
  }

  return createSsrStreamResponse(
    router,
    new Response(readable as any, {
      status:
        router._serverResult?.type === 'render'
          ? router._serverResult.status
          : 200,
      headers: responseHeaders,
    }),
  )
}
