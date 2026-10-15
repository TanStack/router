import { createFileRoute } from '@tanstack/react-router'
import { generateCookie, generateSignedCookie } from 'hono/cookie'
import { parseSigned } from 'hono/utils/cookie'
import {
  appendResponseHeader,
  getRequestHeader,
  setCookie,
} from '@tanstack/react-start/server'
import { sessionPassword } from '~/session'

// These Hono exports work with strings; they do not require a Hono Context.
// They provide signed cookies, not session storage or server-side expiration.
export const Route = createFileRoute('/api/session-hono-cookie')({
  server: {
    handlers: {
      GET: async () => {
        const values = await parseSigned(
          getRequestHeader('cookie') ?? '',
          sessionPassword,
          'hono-signed',
        )
        return Response.json({ user: values['hono-signed'] || null })
      },
      POST: async ({ request }) => {
        const data = await request.json()
        appendResponseHeader(
          'set-cookie',
          await generateSignedCookie(
            'hono-signed',
            data.user,
            sessionPassword,
            {
              httpOnly: true,
              sameSite: 'Lax',
              path: '/',
              maxAge: 3600,
            },
          ),
        )
        setCookie('start-side', 'coexists', { path: '/' })
        return Response.json({ user: data.user })
      },
      DELETE: () => {
        appendResponseHeader(
          'set-cookie',
          generateCookie('hono-signed', '', { path: '/', maxAge: 0 }),
        )
        return Response.json({ cleared: true })
      },
    },
  },
})
