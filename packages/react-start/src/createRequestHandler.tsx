import { AnyRouter, createMemoryHistory } from '@tanstack/router'
import type { APIContext } from 'astro'
import ReactDOMServer from 'react-dom/server'
import { handleEvent, server$ } from '@tanstack/bling/server/server'
import * as React from 'react'
import isbot from 'isbot'
import { StartServer } from './StartServer'
import { PassThrough } from 'stream'

export function createRequestHandler<TRouter extends AnyRouter>(opts: {
  createRouter: () => TRouter
}) {
  return async ({ request }: APIContext) => {
    const fullUrl = new URL(request.url)
    const url = request.url.replace(fullUrl.origin, '')

    if (server$.hasHandler(fullUrl.pathname)) {
      return await handleEvent({
        request,
        env: {},
        locals: {
          $abortSignal: new AbortController().signal, // TODO: Use the real abort signal
        },
      })
    }

    if (fullUrl.pathname.includes('.')) {
      return new Response(null, {
        status: 404,
      })
    }

    console.log('Rendering: ', url, '...')

    const history = createMemoryHistory({
      initialEntries: [url],
    })

    const router = opts.createRouter()

    router.update({
      history,
    })

    await router.load()

    return new Promise((resolve, reject) => {
      let didError = false

      const responseStatusCode = 200
      const responseHeaders = new Headers({
        'Content-Type': 'text/html',
      })

      // Clever way to get the right callback. Thanks Remix!
      const callbackName = isbot(request.headers.get('user-agent'))
        ? 'onAllReady'
        : 'onShellReady'

      const stream = ReactDOMServer.renderToPipeableStream(
        <StartServer router={router} />,
        {
          [callbackName]: () => {
            const body = new PassThrough()

            responseHeaders.set('Content-Type', 'text/html')

            resolve(
              new Response(body as any, {
                headers: responseHeaders,
                status: didError ? 500 : responseStatusCode,
              }),
            )

            stream.pipe(body)
          },
          onShellError: (err) => {
            reject(err)
          },
          onError: (err) => {
            didError = true
            console.log(err)
          },
        },
      )

      setTimeout(() => stream.abort(), 10000)
    })
  }
}
