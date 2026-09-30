import { createFileRoute } from '@tanstack/react-router'
import { setCookie } from '@tanstack/react-start/server'
import { readJson, updateSessionData } from '~/session'

export const Route = createFileRoute('/api/session-helper-cookie')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await updateSessionData(await readJson(request))
        setCookie('helper-session', '1', { path: '/' })
        const headers = new Headers()
        headers.append(
          'Set-Cookie',
          'returned-session=1; Path=/; Expires=Tue, 01 Jan 2030 00:00:00 GMT',
        )
        headers.append('Set-Cookie', 'returned-extra=2; Path=/')
        return Response.json(session, { headers })
      },
    },
  },
})
