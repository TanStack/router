import { createFileRoute } from '@tanstack/react-router'
import { setCookie } from '@tanstack/react-start/server'

export const Route = createFileRoute('/api/multiple-cookies')({
  server: {
    handlers: {
      GET: () => {
        setCookie('route-one', '1', { path: '/' })
        setCookie('route-two', '2', { path: '/' })
        return new Response('cookies')
      },
    },
  },
})
