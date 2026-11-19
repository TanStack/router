import { createMiddleware } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'
import { findUserBySession } from '../server-only'

export const authMiddleware = createMiddleware({ type: 'function' }).server(
  ({ next }) => {
    const user = findUserBySession(getCookie('session'))
    if (!user) {
      throw new Error('Not signed in')
    }
    return next({ context: { user } })
  },
)
