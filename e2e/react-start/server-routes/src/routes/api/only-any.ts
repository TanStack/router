import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

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
