export const XBlingStatusCodeHeader = 'x-bling-status-code'
export const XBlingLocationHeader = 'x-bling-location'
export const LocationHeader = 'Location'
export const ContentTypeHeader = 'content-type'
export const XBlingResponseTypeHeader = 'x-bling-response-type'
export const XBlingContentTypeHeader = 'x-bling-content-type'
export const XBlingOrigin = 'x-bling-origin'
export const JSONResponseType = 'application/json'

/**
 * A JSON response. Converts `data` to JSON and sets the `Content-Type` header.
 */
export function json<Data>(
  data: Data,
  init: number | ResponseInit = {},
): Response {
  let responseInit: any = init
  if (typeof init === 'number') {
    responseInit = { status: init }
  }

  let headers = new Headers(responseInit.headers)

  if (!headers.has(ContentTypeHeader)) {
    headers.set(ContentTypeHeader, 'application/json; charset=utf-8')
  }

  const response = new Response(JSON.stringify(data), {
    ...responseInit,
    headers,
  })

  return response
}

/**
 * A redirect response. Sets the status code and the `Location` header.
 * Defaults to "302 Found".
 */
export function redirect(
  url: string,
  init: number | ResponseInit = 302,
): Response {
  let responseInit = init
  if (typeof responseInit === 'number') {
    responseInit = { status: responseInit }
  } else if (typeof responseInit.status === 'undefined') {
    responseInit.status = 302
  }

  if (url === '') {
    url = '/'
  }

  if (process.env.NODE_ENV === 'development') {
    if (url.startsWith('.')) {
      throw new Error('Relative URLs are not allowed in redirect')
    }
  }

  let headers = new Headers(responseInit.headers)
  headers.set(LocationHeader, url)

  const response = new Response(null, {
    ...responseInit,
    headers: headers,
  })

  return response
}

export function eventStream(
  request: Request,
  init: (send: (event: string, data: any) => void) => () => void,
) {
  let stream = new ReadableStream({
    start(controller) {
      let encoder = new TextEncoder()
      let send = (event: string, data: any) => {
        controller.enqueue(encoder.encode('event: ' + event + '\n'))
        controller.enqueue(encoder.encode('data: ' + data + '\n' + '\n'))
      }
      let cleanup = init(send)
      let closed = false
      let close = () => {
        if (closed) return
        cleanup()
        closed = true
        request.signal.removeEventListener('abort', close)
        controller.close()
      }
      request.signal.addEventListener('abort', close)
      if (request.signal.aborted) {
        close()
        return
      }
    },
  })
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

export function isResponse(value: any): value is Response {
  return (
    value != null &&
    typeof value.status === 'number' &&
    typeof value.statusText === 'string' &&
    typeof value.headers === 'object' &&
    typeof value.body !== 'undefined'
  )
}

const redirectStatusCodes = new Set([204, 301, 302, 303, 307, 308])

export function isRedirectResponse(
  response: Response | any,
): response is Response {
  return (
    response &&
    response instanceof Response &&
    redirectStatusCodes.has(response.status)
  )
}

export class ResponseError extends Error implements Response {
  status: number
  headers: Headers
  name = 'ResponseError'
  ok: boolean
  statusText: string
  redirected: boolean
  url: string
  constructor(response: Response) {
    let message = JSON.stringify({
      $type: 'response',
      status: response.status,
      message: response.statusText,
      headers: [...response.headers.entries()],
    })
    super(message)
    this.status = response.status
    this.headers = new Map([...response.headers.entries()]) as any as Headers
    this.url = response.url
    this.ok = response.ok
    this.statusText = response.statusText
    this.redirected = response.redirected
    this.bodyUsed = false
    this.type = response.type
    this.response = () => response
  }

  response: () => Response
  type: ResponseType
  clone(): Response {
    return this.response()
  }
  get body(): ReadableStream<Uint8Array> {
    return this.response().body!
  }
  bodyUsed: boolean
  async arrayBuffer(): Promise<ArrayBuffer> {
    return await this.response().arrayBuffer()
  }
  async blob(): Promise<Blob> {
    return await this.response().blob()
  }
  async formData(): Promise<FormData> {
    return await this.response().formData()
  }

  async text() {
    return await this.response().text()
  }

  async json() {
    return await this.response().json()
  }
}
