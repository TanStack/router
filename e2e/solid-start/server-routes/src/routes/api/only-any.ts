import { createFileRoute } from '@tanstack/solid-router'
import { json } from '@tanstack/solid-start'

export const Route = createFileRoute('/api/only-any')({
  server: {
    handlers: {
      ANY: ({ request }) => {
        return json(
          {
            handler: 'ANY',
            method: request.method,
          },
          { headers: { 'X-HANDLER': 'ANY', 'X-METHOD': request.method } },
        )
      },
    },
  },
})
