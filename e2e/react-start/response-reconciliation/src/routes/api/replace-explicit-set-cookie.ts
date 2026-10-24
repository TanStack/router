import { createFileRoute } from '@tanstack/react-router'
import { setResponseHeader } from '@tanstack/react-start/server'

export const Route = createFileRoute('/api/replace-explicit-set-cookie')({
  server: {
    handlers: {
      GET: () => {
        setResponseHeader('set-cookie', 'explicit-new=1; Path=/')
        return new Response('explicit', {
          headers: { 'set-cookie': 'explicit-old=1; Path=/' },
        })
      },
    },
  },
})
