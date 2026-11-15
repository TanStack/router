import { getIronSession } from 'iron-session'
import { getCookie, setCookie } from '@tanstack/solid-start/server'
import type { User } from '~/prisma-generated/client'

type SessionUser = {
  userEmail: User['email']
}

export function getAppSession() {
  return getIronSession<SessionUser>(
    { read: getCookie, write: setCookie },
    {
      cookieName: 'test-auth-session',
      // This fixture only runs locally with test credentials.
      password: 'local-e2e-only-session-password-at-least-32-characters',
      ttl: 60 * 60,
      cookieOptions: {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/',
      },
    },
  )
}
