import { createFileRoute } from '@tanstack/react-router'
import { readJson, readSession, updateSessionData } from '~/session'

function getName(request: Request) {
  return new URL(request.url).searchParams.get('name') || 'app-named'
}

export const Route = createFileRoute('/api/session-named')({
  server: {
    handlers: {
      GET: async ({ request }) =>
        Response.json({
          data: { ...(await readSession(getName(request))) },
        }),
      POST: async ({ request }) =>
        Response.json(
          await updateSessionData(await readJson(request), getName(request)),
        ),
    },
  },
})
