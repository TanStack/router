import { createFileRoute } from '@tanstack/react-router'
import { make } from '../middleware'

export const Route = createFileRoute('/api/admin/$id')({
  server: {
    middleware: [make('b', 2)],
    handlers: ({ createHandlers }) =>
      createHandlers({
        GET: {
          middleware: [make('c', 3)],
          handler: ({ params, context }) =>
            Response.json({
              id: params.id,
              total: context.a + context.b + context.c,
            }),
        },
      }),
  },
})
