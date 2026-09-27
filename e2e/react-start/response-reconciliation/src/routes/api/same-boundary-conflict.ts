import { createFileRoute } from '@tanstack/react-router'
import {
  setResponseHeader,
  setResponseStatus,
} from '@tanstack/react-start/server'

export const Route = createFileRoute('/api/same-boundary-conflict')({
  server: {
    handlers: {
      GET: () => {
        setResponseStatus(235, 'same-boundary')
        setResponseHeader('x-conflict', 'helper')
        return new Response('conflict', {
          status: 201,
          statusText: 'response-status',
          headers: { 'x-conflict': 'response' },
        })
      },
    },
  },
})
