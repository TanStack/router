import { createFileRoute } from '@tanstack/react-router'
import {
  setCookie,
  setResponseHeader,
  setResponseStatus,
} from '@tanstack/react-start/server'

export const Route = createFileRoute('/api/throw-after-status')({
  server: {
    handlers: {
      GET: ({ request }) => {
        const url = new URL(request.url)
        setResponseStatus(401, 'Unauthorized')
        setResponseHeader('x-error-helper', 'yes')
        setCookie('throw-after-status', '1', { path: '/' })
        if (url.searchParams.get('throw') === 'response') {
          throw new Response('Unauthorized response', {
            status: 200,
            headers: { 'x-thrown-response': 'yes' },
          })
        }
        throw new Error('Unauthorized route')
      },
    },
  },
})
