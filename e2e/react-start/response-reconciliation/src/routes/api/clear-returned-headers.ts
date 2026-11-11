import { createFileRoute } from '@tanstack/react-router'
import { clearResponseHeaders } from '@tanstack/react-start/server'

export const Route = createFileRoute('/api/clear-returned-headers')({
  server: {
    handlers: {
      GET: () => {
        clearResponseHeaders()
        return new Response('clear', {
          headers: { 'x-clear-one': '1', 'x-clear-two': '2' },
        })
      },
    },
  },
})
