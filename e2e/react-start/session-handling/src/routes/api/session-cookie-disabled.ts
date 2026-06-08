import { createFileRoute } from '@tanstack/react-router'
import { readJson, readSession, updateSessionData } from '~/session'

const cookieDisabled = { cookie: false }

export const Route = createFileRoute('/api/session-cookie-disabled')({
  server: {
    handlers: {
      GET: async () => {
        return Response.json(await readSession(cookieDisabled))
      },
      POST: async ({ request }) => {
        return Response.json(
          await updateSessionData(await readJson(request), cookieDisabled),
        )
      },
    },
  },
})
