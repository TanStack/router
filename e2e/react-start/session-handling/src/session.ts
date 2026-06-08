import { setCookie, useSession } from '@tanstack/react-start/server'

export const sessionPassword = 'x'.repeat(64)

let sessionId = 0

export function sessionConfig(overrides: Record<string, unknown> = {}) {
  return {
    password: sessionPassword,
    generateId: () => `session-${++sessionId}`,
    ...overrides,
  }
}

export async function readJson(request: Request) {
  try {
    return (await request.json()) as Record<string, unknown>
  } catch {
    return {}
  }
}

export async function readSession(overrides: Record<string, unknown> = {}) {
  const session = await useSession<Record<string, any>>(
    sessionConfig(overrides),
  )
  return {
    id: session.id,
    data: session.data,
  }
}

export async function updateSessionData(
  update: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
) {
  const session = await useSession<Record<string, any>>(
    sessionConfig(overrides),
  )
  await session.update(update)
  return {
    id: session.id,
    data: session.data,
  }
}

export async function updateSessionWithHelperCookie(
  update: Record<string, unknown>,
) {
  const session = await updateSessionData(update)
  setCookie('helper-session', '1', { path: '/' })
  return session
}
