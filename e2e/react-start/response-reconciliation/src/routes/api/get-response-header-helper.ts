import { createFileRoute } from '@tanstack/react-router'
import {
  getResponseHeader,
  setResponseHeader,
} from '@tanstack/react-start/server'

export const Route = createFileRoute('/api/get-response-header-helper')({
  server: {
    handlers: {
      GET: () => {
        setResponseHeader('x-helper-visible', 'yes')
        const value = getResponseHeader('x-helper-visible') || 'missing'
        return new Response(value, { headers: { 'x-read-after-set': value } })
      },
    },
  },
})
