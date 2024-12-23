import { Readable } from 'node:stream'
import { getEvent, getRequestHeaders } from 'vinxi/http'
import invariant from 'tiny-invariant'
import { serverFnFetcher } from '../client'
import { getBaseUrl } from '../client-runtime/getBaseUrl'
import { handleServerRequest } from '../server-handler/index'
import type { CreateSsrRpcFn } from '@tanstack/directive-functions-plugin'

export function createIncomingMessage(
  url: string,
  method: string,
  headers: HeadersInit,
): Readable {
  const readable = new Readable({ objectMode: true }) as any
  readable._read = () => {}

  readable.url = url
  readable.method = method
  readable.headers = headers
  readable.connection = {}
  readable.getHeaders = () => {
    return headers
  }
  return readable
}

// function createAsyncStream(options?: WritableOptions) {
//   let firstActivity = false
//   let resolveActivity: () => void
//   let finishActivity: () => void

//   const initialPromise = new Promise<void>((resolve) => {
//     resolveActivity = resolve
//   })

//   const finishPromise = new Promise<void>((resolve) => {
//     finishActivity = resolve
//   })

//   const readable = new Readable({
//     objectMode: true,
//   })

//   readable._read = () => {}

//   const writable = new Writable({
//     ...options,
//     write(chunk, encoding, callback) {
//       if (!firstActivity) {
//         firstActivity = true
//         resolveActivity()
//       }
//       readable.push(chunk, encoding)
//       callback()
//     },
//   }) as any

//   const headers = new Headers()

//   writable.setHeader = (key: string, value: string) => {
//     headers.set(key, value)
//   }

//   writable.on('finish', () => {
//     readable.push(null)
//     readable.destroy()
//     finishActivity()
//   })

//   return {
//     readable,
//     writable,
//     headers,
//     initialPromise,
//     finishPromise,
//   } as const
// }

const fakeHost = 'http://localhost:3000'

export const createSsrRpc: CreateSsrRpcFn = (functionId) => {
  const functionUrl = getBaseUrl(fakeHost, functionId)

  const ssrFn = (...args: Array<any>) => {
    invariant(
      args.length === 1,
      'Server functions can only accept a single argument',
    )

    return serverFnFetcher(functionUrl, args, async (request) => {
      const event = getEvent()

      const ogRequestHeaders = getRequestHeaders(event)

      Object.entries(ogRequestHeaders).forEach(([key, value]) => {
        if (!request.headers.has(key)) {
          request.headers.append(key, value!)
        }
      })

      //   // For RSC, we need to proxy this request back to the server under
      //   // the /_server path and let the RSC/Server-fn router handle it
      // if (RSC) {

      //   const incomingMessage = createIncomingMessage(
      //     new URL(request.url).pathname + new URL(request.url).search,
      //     request.method,
      //     Object.fromEntries(request.headers.entries()),
      //   )

      //   const asyncStream = createAsyncStream()

      //   const result = await handleHTTPEvent(
      //     new H3Event(incomingMessage as any, asyncStream.writable),
      //   )

      //   console.info('awaiting initial promise', result, asyncStream)

      //   await asyncStream.initialPromise

      //   // Only augment the headers of the underlying document request
      //   // if the response headers have not been sent yet
      //   if (!(event as any).__tsrHeadersSent) {
      //     const ogResponseHeaders = getResponseHeaders(event)

      //     asyncStream.headers.forEach((value, key) => {
      //       if (!Object.hasOwn(ogResponseHeaders, key)) {
      //         ogResponseHeaders[key] = value
      //       }
      //     })

      //     setResponseHeaders(event, ogResponseHeaders as any)
      //   }

      //   console.info(asyncStream.readable)

      //   // if (asyncStream.headers.get('content-type') === 'application/json') {
      //   //   await asyncStream.finishPromise
      //   // }

      //   return new Response(Readable.toWeb(asyncStream.readable) as any, {
      //     headers: asyncStream.headers,
      //   })
      // }

      // For now, we're not doing RSC, so we just handle the request
      // in the current non-worker scope
      return handleServerRequest(request, event)
    })
  }

  return Object.assign(ssrFn, {
    url: functionUrl.replace(fakeHost, ''),
    functionId,
  })
}
