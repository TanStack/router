import { getIronSession } from 'iron-session'
import { getCookie, setCookie } from '@tanstack/react-start/server'

// Fixed secrets and insecure cookies are only for this local HTTP test fixture.
export const sessionPassword = 'start-external-session-test-only-'.repeat(2)
export type SessionData = {
  user?: string
  token?: string
  serverFn?: string
  middleware?: string
  notice?: string
  ssrCount?: number
}

export async function updateSessionData(data: SessionData, name?: string) {
  const session = await readSession(name)
  Object.assign(session, data)
  await session.save()
  return { data: { ...session } }
}

export async function destroySession() {
  const session = await readSession()
  session.destroy()
}

export function readSession(cookieName = 'app-session') {
  return getIronSession<SessionData>(
    { read: getCookie, write: setCookie },
    {
      cookieName,
      password: sessionPassword,
      ttl: 3600,
      chunk: true,
      cookieOptions: {
        secure: false,
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      },
    },
  )
}

export async function readJson(request: Request): Promise<SessionData> {
  return request.json()
}
