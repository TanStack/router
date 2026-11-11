import { createFileRoute } from '@tanstack/react-router'
import { removeResponseHeader } from '@tanstack/react-start/server'

export const Route = createFileRoute('/api/remove-returned-header')({
  server: {
    handlers: {
      GET: () => {
        removeResponseHeader('x-remove-me')
        return new Response('remove', {
          headers: { 'x-remove-me': 'response', 'x-keep': 'yes' },
        })
      },
    },
  },
})
