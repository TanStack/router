import { getIronSession } from 'iron-session'
import { getCookie, setCookie } from '@tanstack/solid-start/server'
import type { User } from '@prisma/client'

type SessionUser = {
  userEmail: User['email']
}

export function getAppSession() {
  const password = process.env.SESSION_PASSWORD
  if (!password || password.length < 32) {
    throw new Error('Set SESSION_PASSWORD to at least 32 characters')
  }

  return getIronSession<SessionUser>(
    { read: getCookie, write: setCookie },
    {
      cookieName: 'app-session',
      password,
      ttl: 7 * 24 * 60 * 60,
      cookieOptions: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
      },
    },
  )
}
