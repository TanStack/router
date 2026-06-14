import {
  createStartHandler,
  defaultStreamHandler,
  handleStartError,
} from '@tanstack/react-start/server'
import handler, { createServerEntry } from '@tanstack/react-start/server-entry'

const uncaughtFetch = createStartHandler(defaultStreamHandler)

function markCustomServerEntry(response: Response): Response {
  try {
    response.headers.set('x-custom-server-entry', 'yes')
    return response
  } catch {
    const headers = new Headers(response.headers)
    headers.set('x-custom-server-entry', 'yes')
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  }
}

export default createServerEntry({
  async fetch(request, opts) {
    if (request.headers.get('x-custom-handle-errors') === 'false') {
      try {
        return markCustomServerEntry(await uncaughtFetch(request, opts))
      } catch (error) {
        if (request.headers.get('x-custom-handle-start-error') === 'true') {
          return markCustomServerEntry(handleStartError(error))
        }
        return markCustomServerEntry(
          new Response(error instanceof Error ? error.message : 'error', {
            status: 555,
            headers: {
              'x-custom-entry-catch': 'yes',
            },
          }),
        )
      }
    }

    try {
      return markCustomServerEntry(await handler.fetch(request, opts))
    } catch (error) {
      return markCustomServerEntry(
        new Response(error instanceof Error ? error.message : 'error', {
          status: 556,
          headers: {
            'x-custom-entry-catch': 'unexpected',
          },
        }),
      )
    }
  },
})
