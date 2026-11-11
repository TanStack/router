import { createFileRoute } from '@tanstack/react-router'
import { baseResponse } from './-response'

export const Route = createFileRoute('/api/base')({
  server: {
    handlers: {
      GET: () => baseResponse('base'),
    },
  },
})
