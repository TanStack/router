import { createFileRoute } from '@tanstack/react-router'
import { baseResponse, routeBoundaryMiddleware } from './-response'

export const Route = createFileRoute('/api/direct-mutation-visible')({
  server: {
    middleware: [routeBoundaryMiddleware],
    handlers: {
      GET: () => baseResponse('direct-mutation-visible'),
    },
  },
})
