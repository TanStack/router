import { createFileRoute } from '@tanstack/react-router'
import {
  baseResponse,
  returnedResponseMiddleware,
  routeBoundaryMiddleware,
} from './-response'

export const Route = createFileRoute('/api/two-returned-responses')({
  server: {
    middleware: [routeBoundaryMiddleware, returnedResponseMiddleware],
    handlers: {
      GET: () => baseResponse('two-returned-responses'),
    },
  },
})
