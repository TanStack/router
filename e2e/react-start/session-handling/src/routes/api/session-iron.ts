import { createFileRoute } from '@tanstack/react-router'
import { readJson, readSession } from '~/session'

export const Route = createFileRoute('/api/session-iron')({
  server: {
    handlers: {
      GET: async () =>
        Response.json({ data: { ...(await readSession('iron-session')) } }),
      POST: async ({ request }) => {
        const session = await readSession('iron-session')
        const data = await readJson(request)
        if (typeof data.user === 'string') {
          session.user = data.user
        }
        if (typeof data.token === 'string') {
          session.token = data.token
        }
        await session.save()
        return Response.json({ data: { ...session } })
      },
      DELETE: async () => {
        const session = await readSession('iron-session')
        session.destroy()
        return Response.json({ cleared: true })
      },
    },
  },
})
