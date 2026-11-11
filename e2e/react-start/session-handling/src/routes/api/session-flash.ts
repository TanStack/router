import { createFileRoute } from '@tanstack/react-router'
import { readSession } from '~/session'

export const Route = createFileRoute('/api/session-flash')({
  server: {
    handlers: {
      POST: async () => {
        const session = await readSession()
        session.notice = 'Saved successfully'
        await session.save()
        return Response.json({ saved: true })
      },
      GET: async () => {
        const session = await readSession()
        const notice = session.notice ?? null
        delete session.notice
        await session.save()
        return Response.json({ notice })
      },
    },
  },
})
