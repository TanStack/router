import { createFileRoute } from '@tanstack/react-router'
import { baseResponse, routeBoundaryMiddleware } from './-response'

export const Route = createFileRoute('/api/route-before-next')({
  server: {
    middleware: [routeBoundaryMiddleware],
    handlers: {
      GET: () => baseResponse('route-before-next'),
    },
  },
})
