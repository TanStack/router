import { createFileRoute } from '@tanstack/react-router'
import { setResponseHeader } from '@tanstack/react-start/server'

export const Route = createFileRoute('/api/explicit-set-cookie-header')({
  server: {
    handlers: {
      GET: () => {
        setResponseHeader('set-cookie', [
          'explicit-one=1; Path=/',
          'explicit-two=2; Path=/',
        ])
        return new Response('explicit')
      },
    },
  },
})
