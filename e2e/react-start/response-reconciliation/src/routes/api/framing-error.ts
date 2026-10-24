import { createFileRoute } from '@tanstack/react-router'
import { setResponseHeader } from '@tanstack/react-start/server'

export const Route = createFileRoute('/api/framing-error')({
  server: {
    handlers: {
      GET: async () => {
        // Headers for a compressed file whose read then fails.
        setResponseHeader('content-encoding', 'gzip')
        setResponseHeader('content-length', '2')
        await Promise.resolve()
        throw new Error('File read failed')
      },
    },
  },
})
