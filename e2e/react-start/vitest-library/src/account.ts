import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { sessionMiddleware } from './session'

export const getAccount = createServerFn()
  .middleware([sessionMiddleware])
  .handler(({ context }) => {
    setResponseHeader('cache-control', 'private')
    return { name: context.user }
  })
