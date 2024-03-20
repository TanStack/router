import {
  getEvent,
  getHeaders,
  getRequestHeaders,
  getResponseHeaders,
  setHeader,
  setResponseHeaders,
  toWebRequest,
} from 'vinxi/http'
import { FetchFn } from '../client'
import { getBaseUrl } from '../client/client-runtime'
import { fetcher } from '../server-fns/fetcher'
import { handleRequest } from '../server-fns/handler'

export function createServerReference<TPayload, TResponse>(
  _fn: FetchFn<TPayload, TResponse>,
  id: string,
  name: string,
) {
  // let base = getBaseUrl(import.meta.env.SERVER_BASE_URL, id, name)
  let base = getBaseUrl('http://localhost:3000', id, name)

  const proxyFn = (...args: any[]) =>
    fetcher(base, args, async (request) => {
      const event = getEvent()

      const ogRequestHeaders = getRequestHeaders(event)

      Object.entries(ogRequestHeaders).forEach(([key, value]) => {
        if (!request.headers.has(key)) {
          request.headers.append(key, value!)
        }
      })

      const response = await handleRequest(request)

      const ogResponseHeaders = getResponseHeaders(event)

      response.headers.forEach((value, key) => {
        if (!Object.hasOwn(ogResponseHeaders, key)) {
          ogResponseHeaders[key] = value
        }
      })

      setResponseHeaders(event, ogResponseHeaders)

      return response
    })

  return Object.assign(proxyFn, {
    url: base,
  })
}
