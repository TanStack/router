import { createFileRoute } from '@tanstack/react-router'
import { baseResponse, routeBoundaryMiddleware } from './-response'

export const Route = createFileRoute('/api/route-after-next')({
  server: {
    middleware: [routeBoundaryMiddleware],
    handlers: {
      GET: () => baseResponse('route-after-next'),
    },
  },
})
