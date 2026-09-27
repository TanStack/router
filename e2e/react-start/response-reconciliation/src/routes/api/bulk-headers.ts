import { createFileRoute } from '@tanstack/react-router'
import { setResponseHeaders } from '@tanstack/react-start/server'

export const Route = createFileRoute('/api/bulk-headers')({
  server: {
    handlers: {
      GET: () => {
        const headers = new Headers({
          'x-bulk-one': '1',
          'x-bulk-two': '2',
        })
        headers.append('set-cookie', 'bulk-one=1; Path=/')
        headers.append('set-cookie', 'bulk-two=2; Path=/')
        setResponseHeaders(headers)
        return new Response('bulk', { headers: { 'x-keep': 'yes' } })
      },
    },
  },
})
