import handler from '@tanstack/react-start/server-entry'
import { waitUntil } from 'cloudflare:workers'

// Five seconds makes this example's expiry easy to observe locally.
const publicCacheControl = 'public, max-age=0, s-maxage=5'

export default {
  async fetch(request: Request) {
    const url = new URL(request.url)
    // Only this explicitly reviewed public document can use the shared cache.
    const eligible =
      process.env.NODE_ENV === 'production' &&
      request.method === 'GET' &&
      url.pathname === '/' &&
      request.headers.get('accept')?.includes('text/html') &&
      ![
        'cookie',
        'authorization',
        'range',
        'if-match',
        'if-none-match',
        'if-range',
        'if-unmodified-since',
        'if-modified-since',
        'cache-control',
        'pragma',
        'origin',
      ].some((name) => request.headers.has(name))

    if (!eligible) {
      return downstream(await handler.fetch(request), 'BYPASS')
    }

    // Keep the entire search string, and partition header-based locale variants.
    // Use a separate namespace so these keys cannot collide with static assets.
    const cache = await caches.open('public-html-v1')
    const keyUrl = new URL(request.url)
    keyUrl.search += `${keyUrl.search ? '&' : '?'}__html_language=${encodeURIComponent(request.headers.get('accept-language') ?? '')}`
    const key = new Request(keyUrl)
    const cached = await cache.match(key)
    if (cached) {
      return downstream(cached, 'HIT')
    }

    const response = await handler.fetch(request)
    const varies = (response.headers.get('vary') ?? '')
      .toLowerCase()
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
    if (
      response.status !== 200 ||
      !response.headers.get('content-type')?.startsWith('text/html') ||
      response.headers.has('set-cookie') ||
      response.headers.has('content-encoding') ||
      response.headers.get('cache-control') !== publicCacheControl ||
      varies.some(
        (name) => name !== 'accept-encoding' && name !== 'accept-language',
      )
    ) {
      return downstream(response, 'BYPASS')
    }

    // The cache consumes its own stream while the original streams to the client.
    waitUntil(
      cache.put(key, response.clone()).catch((error) => {
        console.error('Could not cache public HTML', error)
      }),
    )
    return downstream(response, 'MISS')
  },
}

function downstream(response: Response, status: string) {
  const result = new Response(response.body, response)
  // Only the explicit Worker cache owns freshness; browsers must contact it.
  result.headers.set('Cache-Control', 'private, no-store')
  result.headers.set('X-HTML-Cache', status)
  return result
}
