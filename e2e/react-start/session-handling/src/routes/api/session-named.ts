import { createFileRoute } from '@tanstack/react-router'
import { readJson, readSession, updateSessionData } from '~/session'

function getName(request: Request) {
  return new URL(request.url).searchParams.get('name') || 'named'
}

export const Route = createFileRoute('/api/session-named')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        return Response.json(await readSession({ name: getName(request) }))
      },
      POST: async ({ request }) => {
        return Response.json(
          await updateSessionData(await readJson(request), {
            name: getName(request),
          }),
        )
      },
    },
  },
})
