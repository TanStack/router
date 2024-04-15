/// <reference types="vinxi/types/server" />
import * as React from 'react'
import { renderToPipeableStream } from 'react-dom/server'
import { eventHandler, getResponseHeaders, toWebRequest } from 'vinxi/server'
import { getManifest } from 'vinxi/manifest'
import {
  StartServer,
  transformStreamWithRouter,
} from '@tanstack/react-router-server/server'

import { createMemoryHistory } from '@tanstack/react-router'
import {
  serverFnPayloadTypeHeader,
  serverFnReturnTypeHeader,
} from '@tanstack/react-router-server'
import { isbot } from 'isbot'
import { createRouter } from './router'
import type { PipeableStream } from 'react-dom/server'

export default eventHandler(async (event) => {
  const req = toWebRequest(event)
  const url = new URL(req.url)
  const href = url.href.replace(url.origin, '')

  // Get assets for the server/client
  const clientManifest = getManifest('client')
  const assets = (
    await clientManifest.inputs[clientManifest.handler].assets()
  ).filter((d: any) => {
    return !d.children?.includes('nuxt-devtools')
  }) as any
  if (import.meta.env.DEV) {
    assets.push(
      {
        tag: 'script',
        attrs: {},
        children: getHydrationOverlayScriptContext(),
      },
      {
        tag: 'script',
        children: `window.__vite_plugin_react_preamble_installed__ = true`,
      },
    )
  }

  assets.push({
    tag: 'script',
    attrs: {
      src: clientManifest.inputs[clientManifest.handler].output.path,
      type: 'module',
      async: true,
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
    // eslint-disable-next-line no-shadow
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
  const transforms = [transformStreamWithRouter(router)]

  // Pipe the stream through our transforms
  const transformedStream = transforms.reduce(
    // eslint-disable-next-line no-shadow
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
    statusText:
      router.state.statusCode === 200 ? 'OK' : 'Internal Server Error',
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

function getHydrationOverlayScriptContext() {
  return `
window.BUILDER_HYDRATION_OVERLAY = {}

const selector = 'html'

const handleError = () => {
  window.BUILDER_HYDRATION_OVERLAY.ERROR = true
  let appRootEl = document.querySelector(selector)

  if (appRootEl && !window.BUILDER_HYDRATION_OVERLAY.CSR_HTML) {
    window.BUILDER_HYDRATION_OVERLAY.CSR_HTML = appRootEl.innerHTML
  }
}

const proxyConsole = (method) => {
  const original = console[method]

  console[method] = function () {
    const msg = arguments[0]?.message?.toLowerCase()
    if (msg && (msg.includes('hydration') || msg.includes('hydrating'))) {
      handleError()
    }
    original.apply(console, arguments)
  }
}

const methods = ['log', 'error', 'warn']
methods.forEach(proxyConsole)

window.addEventListener('error', (event) => {
  const msg = event.message.toLowerCase()
  const isHydrationMsg = msg.includes('hydration') || msg.includes('hydrating')

  if (isHydrationMsg) {
    handleError()
  }
})

let BUILDER_HYDRATION_OVERLAY_ELEMENT = document.querySelector(selector)
if (BUILDER_HYDRATION_OVERLAY_ELEMENT) {
window.BUILDER_HYDRATION_OVERLAY.SSR_HTML =
BUILDER_HYDRATION_OVERLAY_ELEMENT.innerHTML
}
`
}
