import { createFileRoute } from '@tanstack/react-router'
import { routeBoundaryMiddleware } from './-response'

export const Route = createFileRoute('/api/readonly-after-next')({
  server: {
    middleware: [routeBoundaryMiddleware],
    handlers: {
      GET: () => fetch('data:text/plain,readonly'),
    },
  },
})
