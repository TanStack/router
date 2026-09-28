import { createFileRoute } from '@tanstack/react-router'
import { setResponseStatus } from '@tanstack/react-start/server'
import { createUpstreamFailure } from './-upstream'

export const Route = createFileRoute('/api/status-contracts')({
  server: {
    handlers: {
      GET: ({ request }) => {
        const scenario = new URL(request.url).searchParams.get('scenario')

        if (scenario === 'invalid-status-return') {
          setResponseStatus(999, 'Ignored')
          return new Response('missing', {
            status: 404,
            statusText: 'Not Found',
          })
        }

        if (scenario === 'invalid-status-throw') {
          setResponseStatus(101)
          throw new Error('Unexpected status contract failure')
        }

        if (scenario === 'upstream-error-cause') {
          throw new Error('Upstream failed', { cause: createUpstreamFailure() })
        }

        return new Response(`Unknown scenario: ${scenario}`, { status: 400 })
      },
    },
  },
})
