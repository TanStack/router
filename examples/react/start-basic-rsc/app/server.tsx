/// <reference types="vinxi/types/server" />
import type { PipeableStream } from 'react-dom/server'
import { renderToPipeableStream } from 'react-dom/server'
import { eventHandler, getResponseHeaders, toWebRequest } from 'vinxi/server'
import { getManifest } from 'vinxi/manifest'
import { StartServer, transformStreamWithRouter } from '@tanstack/start/server'
// import { Transform, PassThrough } from 'node:stream'

import { createRouter } from './router'
import { createMemoryHistory } from '@tanstack/react-router'
import {
  serverFnPayloadTypeHeader,
  serverFnReturnTypeHeader,
} from '@tanstack/start'
import isbot from 'isbot'

export default eventHandler(async (event) => {
  const req = toWebRequest(event)
  const url = new URL(req.url)
  const href = url.href.replace(url.origin, '')

  // Get assets for the server/client
  const clientManifest = getManifest('client')
  // let assets = (
  //   await clientManifest.inputs[clientManifest.handler].assets()
  // ).filter((d: any) => {
  //   return !d.children?.includes('nuxt-devtools')
  // }) as any

  const assets = []

  if (import.meta.env.DEV) {
    assets.push({
      tag: 'script',
      children: `window.__vite_plugin_react_preamble_installed__ = true`,
    })
  }

  assets.push({
    tag: 'script',
    attrs: {
      src: clientManifest.inputs[clientManifest.handler].output.path,
      type: 'module',
      async: true,
      suppressHydrationWarning: true,
    },
  })

  // Create a router
  const router = createRouter()

  // Create a history for the router
  const history = createMemoryHistory({
    initialEntries: [href],
  })

  // Update the router with the history and context
  router.update({
    history,
    context: {
      assets,
    },
  })

  await router.load()

  // Handle Redirects
  const { redirect } = router.state

  if (redirect) {
    console.info('Redirecting...', redirect.statusCode, redirect.href)
    return new Response(null, {
      status: redirect.statusCode,
      headers: {
        ...redirect.headers,
        Location: redirect.href,
      },
    })
  }

  const isRobot = isbot(req.headers.get('User-Agent'))

  const stream = await new Promise<PipeableStream>(async (resolve) => {
    // Yes, I'm shadowing "stream" again, keep your shirt on!
    const stream = renderToPipeableStream(<StartServer router={router} />, {
      ...(isRobot
        ? {
            onAllReady() {
              resolve(stream)
            },
          }
        : {
            onShellReady() {
              resolve(stream)
            },
          }),
    })
  })

  // Add our Router transform to the stream
  const transforms = [
    transformStreamWithRouter(router),
    // // A transform that logs chunks
    // new Transform({
    //   transform(chunk, encoding, callback) {
    //     const str = chunk.toString()
    //     console.info('')
    //     console.info('CHUNK')
    //     console.info('')
    //     console.info(str)
    //     this.push(str)
    //     return callback()
    //   },
    // }),
  ]

  // Pipe the stream through our transforms
  const transformedStream = transforms.reduce(
    (stream, transform) => stream.pipe(transform as any),
    stream,
  )

  ;(event as any).__tsrHeadersSent = true

  let headers = {
    ...getResponseHeaders(event),
    'Content-Type': 'text/html',
    ...router.state.matches.reduce((acc, match) => {
      if (match.headers) {
        Object.assign(acc, match.headers)
      }
      return acc
    }, {}),
  }

  // Remove server function headers
  ;[serverFnReturnTypeHeader, serverFnPayloadTypeHeader].forEach((header) => {
    delete headers[header]
  })

  // Dedupe headers
  headers = dedupeHeaders(Object.entries(headers))

  return new Response(transformedStream as any, {
    status: router.state.statusCode,
    statusText: `${router.state.statusCode}`.startsWith('5')
      ? 'Internal Server Error'
      : 'OK',
    headers,
  })
})

function dedupeHeaders(headerList: [string, string][]): [string, string][] {
  // Object to store the deduplicated headers
  const seen = new Set()

  // Reverse, filter with seen, then reverse again
  return [...headerList]
    .reverse()
    .filter(([name]) => {
      const key = name.toLowerCase()
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
    .reverse()
}
