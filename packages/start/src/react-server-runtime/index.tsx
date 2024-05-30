// @ts-nocheck
import { Readable, Writable } from 'node:stream'
import { text } from 'stream/consumers'
import {
  H3Event,
  getEvent,
  getRequestHeaders,
  getResponseHeaders,
  handleHTTPEvent,
  setResponseHeaders,
} from 'vinxi/http'
// import * as ReactServerDOM from '@vinxi/react-server-dom/client'
// import { fetcher, getBaseUrl } from '../client-runtime'
// import type { FetchFn } from '../client'
/**
 *
 * @returns {import('node:http').IncomingMessage}
 */
export function createIncomingMessage(url, method, headers) {
  const readable = new Readable({ objectMode: true })
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

function createStream() {
  const readable = new Readable({
    objectMode: true,
  })
  readable._read = () => {}
  readable.headers = {}

  const writableStream = new Writable({
    write(chunk, encoding, callback) {
      console.log(chunk)
      readable.push(chunk)
      callback()
    },
  })

  writableStream.getHeaders = () => {
    return {}
  }

  writableStream.setHeader = () => {}

  writableStream.on('finish', () => {
    readable.push(null)
    readable.destroy()
  })

  return {
    readable: readable,
    writable: writableStream,
  }
}

async function handleRequest(request: Request) {
  const message = createIncomingMessage(
    new URL(request.url).pathname + new URL(request.url).search,
    request.method,
    Object.fromEntries(request.headers.entries()),
  )
  console.log(message)
  const responseStream = createStream()
  console.log(responseStream)
  await handleHTTPEvent(new H3Event(message, responseStream.writable))

  return responseStream.readable
}

export function createServerReference<TPayload, TResponse>(
  _fn: any,
  id: string,
  name: string,
) {
  return _fn
  console.log('creating server reference in worker', _fn, id, name)
  // let base = getBaseUrl(import.meta.env.SERVER_BASE_URL, id, name)
  const base = getBaseUrl('http://localhost:3000', id, name)

  const proxyFn = (...args: Array<any>) =>
    fetcher(base, args, async (request) => {
      const event = getEvent()

      const ogRequestHeaders = getRequestHeaders(event)

      Object.entries(ogRequestHeaders).forEach(([key, value]) => {
        if (!request.headers.has(key)) {
          request.headers.append(key, value!)
        }
      })

      const response = await handleRequest(request)
      console.log(await text(response))

      // Only augment the headers of the underlying document request
      // if the response headers have not been sent yet
      if (!(event as any).__tsrHeadersSent) {
        const ogResponseHeaders = getResponseHeaders(event)

        response.headers.forEach((value, key) => {
          if (!Object.hasOwn(ogResponseHeaders, key)) {
            ogResponseHeaders[key] = value
          }
        })

        setResponseHeaders(event, ogResponseHeaders as any)
      }

      return response
    })

  return Object.assign(proxyFn, {
    url: base,
  })
}
