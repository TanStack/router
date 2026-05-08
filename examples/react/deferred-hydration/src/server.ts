import handler from '@tanstack/react-start/server-entry'

function acceptsGzip(request: Request) {
  return /\bgzip\b/.test(request.headers.get('accept-encoding') ?? '')
}

function appendVary(headers: Headers, value: string) {
  const existing = headers.get('vary')
  if (!existing) {
    headers.set('vary', value)
    return
  }

  const values = existing.split(',').map((item) => item.trim().toLowerCase())
  if (!values.includes(value.toLowerCase())) {
    headers.set('vary', `${existing}, ${value}`)
  }
}

function gzipHtmlResponse(request: Request, response: Response) {
  const contentType = response.headers.get('content-type') ?? ''
  if (
    request.method === 'HEAD' ||
    !response.body ||
    !acceptsGzip(request) ||
    response.headers.has('content-encoding') ||
    !contentType.startsWith('text/html') ||
    typeof CompressionStream === 'undefined'
  ) {
    return response
  }

  const headers = new Headers(response.headers)
  headers.set('content-encoding', 'gzip')
  headers.delete('content-length')
  appendVary(headers, 'Accept-Encoding')

  return new Response(response.body.pipeThrough(new CompressionStream('gzip')), {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export default {
  async fetch(request: Request) {
    return gzipHtmlResponse(request, await handler.fetch(request))
  },
}
