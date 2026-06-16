import { createFileRoute } from '@tanstack/react-router'
import { sealSession, useSession } from '@tanstack/react-start/server'
import { readJson, sessionConfig } from '~/session'

export const Route = createFileRoute('/api/session-seal')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const config = sessionConfig({ cookie: false })
        const session = await useSession<Record<string, any>>(config)
        await session.update(await readJson(request))
        return Response.json({
          id: session.id,
          data: session.data,
          sealed: await sealSession(config),
        })
      },
    },
  },
})
