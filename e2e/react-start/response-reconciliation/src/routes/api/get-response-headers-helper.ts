import { createFileRoute } from '@tanstack/react-router'
import {
  getResponseHeaders,
  setResponseHeader,
} from '@tanstack/react-start/server'

export const Route = createFileRoute('/api/get-response-headers-helper')({
  server: {
    handlers: {
      GET: () => {
        setResponseHeader('x-headers-helper-visible', 'yes')
        const headers = getResponseHeaders()
        const value = headers.get('x-headers-helper-visible') || 'missing'
        headers.set('x-headers-snapshot-write', 'ignored')
        return new Response(value, { headers: { 'x-headers-read': value } })
      },
    },
  },
})
