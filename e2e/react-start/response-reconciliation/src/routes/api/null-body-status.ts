import { createFileRoute } from '@tanstack/react-router'
import { setResponseStatus } from '@tanstack/react-start/server'

export const Route = createFileRoute('/api/null-body-status')({
  server: {
    handlers: {
      GET: ({ request }) => {
        const statusParam = new URL(request.url).searchParams.get('status')
        const status =
          statusParam === '205' ? 205 : statusParam === '304' ? 304 : 204
        setResponseStatus(status)
        return new Response('should-drop', {
          headers: { 'x-null-body': 'yes' },
        })
      },
    },
  },
})
