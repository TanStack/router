import { createFileRoute } from '@tanstack/react-router'
import { readJson, readSession, updateSessionData } from '~/session'

export const Route = createFileRoute('/api/session')({
  server: {
    handlers: {
      GET: async () => {
        return Response.json(await readSession())
      },
      POST: async ({ request }) => {
        return Response.json(await updateSessionData(await readJson(request)))
      },
    },
  },
})
