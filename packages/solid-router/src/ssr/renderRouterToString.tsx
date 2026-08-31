import * as Solid from 'solid-js/web'
import {
  makeSsrSerovalPlugin,
  transformHtmlStringWithRouter,
} from '@tanstack/router-core/ssr/server'
import type { AnyRouter } from '@tanstack/router-core'
import type { JSXElement } from 'solid-js'

async function renderToCompleteString(
  children: () => JSXElement,
  options: Parameters<typeof Solid.renderToStream>[1],
): Promise<string> {
  // Solid creates its timeout before it starts rendering and does not clear it
  // when rendering throws synchronously.
  const stream = Solid.renderToStream(children, options)
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => reject('renderToString timed out'), 30_000)
  })

  try {
    // The server runtime is thenable, although its public type exposes only the
    // streaming methods.
    return await Promise.race([
      stream as unknown as PromiseLike<string>,
      timeout,
    ])
  } finally {
    clearTimeout(timeoutHandle)
  }
}

export const renderRouterToString = async ({
  router,
  responseHeaders,
  children,
}: {
  router: AnyRouter
  responseHeaders: Headers
  children: () => JSXElement
}) => {
  try {
    const serializationAdapters = router.options.serializationAdapters
    const serovalPlugins = serializationAdapters?.map((adapter) =>
      makeSsrSerovalPlugin(adapter, { didRun: false }),
    )

    const html = await transformHtmlStringWithRouter(
      router,
      await renderToCompleteString(children, {
        nonce: router.options.ssr?.nonce,
        plugins: serovalPlugins,
      } as any),
    )
    return new Response(html, {
      status:
        router._serverResult?.type === 'render'
          ? router._serverResult.status
          : 200,
      headers: responseHeaders,
    })
  } catch (error) {
    console.error('Render to string error:', error)
    return new Response('Internal Server Error', {
      status: 500,
      headers: responseHeaders,
    })
  } finally {
    router.serverSsr?.cleanup()
  }
}
