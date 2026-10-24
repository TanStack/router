import { createFileRoute } from '@tanstack/react-router'
import { readJson, readSession, updateSessionData } from '~/session'

export const Route = createFileRoute('/api/session')({
  server: {
    handlers: {
      GET: async () => Response.json({ data: { ...(await readSession()) } }),
      POST: async ({ request }) =>
        Response.json(await updateSessionData(await readJson(request))),
    },
  },
})
