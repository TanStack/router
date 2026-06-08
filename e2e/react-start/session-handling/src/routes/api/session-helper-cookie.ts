import { createFileRoute } from '@tanstack/react-router'
import { readJson, updateSessionWithHelperCookie } from '~/session'

export const Route = createFileRoute('/api/session-helper-cookie')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        return Response.json(
          await updateSessionWithHelperCookie(await readJson(request)),
        )
      },
    },
  },
})
