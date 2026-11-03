import { createSsrRpc } from '@tanstack/react-start/ssr-rpc'
import { createServerFn, createMiddleware } from '@tanstack/react-start'
const authMiddleware = createMiddleware({ type: 'function' }).server(
  ({ next }) => {
    return next({ context: { auth: 'auth' } })
  },
)
const adminMiddleware = createMiddleware({ type: 'function' }).server(
  ({ next }) => {
    return next({ context: { admin: 'admin' } })
  },
)
export const createAuthServerFn = createServerFn().middleware([authMiddleware])
const createAdminServerFn = createAuthServerFn().middleware([adminMiddleware])
export const myAuthedFn = createAuthServerFn().handler(
  createSsrRpc('8wI54n7XLosU5JDSs5CD3r'),
)
export const deleteUserFn = createAdminServerFn().handler(
  createSsrRpc('_zazY1Jgzd8oXXcuPROEv9'),
)
function createFakeFn() {
  return {
    handler: (cb) => {
      return cb()
    },
  }
}
const x = createFakeFn().handler(() => {
  return 'fakeFn'
})
