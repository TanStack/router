import {
  createStart,
  createServerFn,
  createMiddleware,
} from '@tanstack/react-start'

const authMiddleware = createMiddleware({ type: 'function' }).server(
  ({ next }) => {
    return next({
      context: { auth: 'auth' },
    })
  },
)

export const startInstance = createStart(() => ({
  functionMiddleware: [authMiddleware],
}))

export const getLocale = startInstance
  .createServerFn({ method: 'GET' })
  .handler(({ context }) => {
    return { locale: context.locale }
  })

export const getUser = startInstance
  .createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(({ context }) => {
    return { user: context.auth }
  })
