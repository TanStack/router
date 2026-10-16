import { createFileRoute } from '@tanstack/react-router'
import { baseResponse, routeBoundaryMiddleware } from './-response'

export const Route = createFileRoute('/api/replace-after-direct-mutation')({
  server: {
    middleware: [routeBoundaryMiddleware],
    handlers: {
      GET: () => baseResponse('replace-after-direct-mutation'),
    },
  },
})
