import { createFileRoute } from '@tanstack/react-router'
import { setCookie } from '@tanstack/react-start/server'

export const Route = createFileRoute('/api/redirect-with-cookies')({
  server: {
    handlers: {
      GET: () => {
        setCookie('redirect-one', '1', { path: '/' })
        setCookie('redirect-two', '2', { path: '/' })
        setCookie('redirect-three', '3', { path: '/' })
        return new Response(null, {
          status: 307,
          headers: { Location: '/api/base' },
        })
      },
    },
  },
})
