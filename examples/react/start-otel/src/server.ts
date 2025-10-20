import handler from '@tanstack/react-start/server-entry'
import { tracer } from './utils/tracer'

import './otel'

export default {
  async fetch(request: Request) {
    return tracer.startActiveSpan(
      `${request.method} ${new URL(request.url).pathname}`,
      async (span) => {
        try {
          span.setAttribute('http.method', request.method)
          span.setAttribute('http.url', request.url)
          span.setAttribute('http.route', new URL(request.url).pathname)
          const response = await handler.fetch(request)
          span.setAttribute('http.status_code', response.status)
          return response
        } catch (error: any) {
          span.recordException(error)
          throw error
        } finally {
          span.end()
        }
      },
    )
  },
}
