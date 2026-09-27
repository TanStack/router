import server from './server'
import { content, finishStream } from './cache-fixture'

// Test-only content controls. Deploy src/server.ts, never this Worker entry.

export default {
  async fetch(request: Request) {
    const url = new URL(request.url)
    if (url.pathname === '/__cache-test') {
      if (request.method === 'POST') {
        if (url.searchParams.has('finish-stream')) {
          finishStream?.()
        } else {
          content.value = await request.text()
          content.mode = request.headers.get('X-Test-Mode') ?? ''
        }
      }
      return Response.json(content, {
        headers: { 'Cache-Control': 'private, no-store' },
      })
    }
    return server.fetch(request)
  },
}
