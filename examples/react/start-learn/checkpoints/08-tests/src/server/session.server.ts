import '@tanstack/react-start/server-only'
import {
  getRequestHeaders,
  setResponseHeader,
  setResponseStatus,
} from '@tanstack/react-start/server'
import { auth } from './auth.server'
export async function currentUser() {
  setResponseHeader('Cache-Control', 'private, no-store')
  const session = await auth.api.getSession({ headers: getRequestHeaders() })
  return session
    ? {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
      }
    : null
}
export async function requireUser() {
  const user = await currentUser()
  if (!user) {
    setResponseStatus(401)
    throw new Error('Sign in to access your notes')
  }
  return user
}
