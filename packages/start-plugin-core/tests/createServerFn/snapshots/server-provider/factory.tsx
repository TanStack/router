import { createServerRpc } from '@tanstack/react-start/server-rpc'
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
const createAuthServerFn = createServerFn().middleware([authMiddleware])
const createAdminServerFn = createAuthServerFn().middleware([adminMiddleware])
const myAuthedFn_createServerFn_handler = createServerRpc(
  { id: '8wI54n7XLosU5JDSs5CD3r', name: 'myAuthedFn', filename: 'src/test.ts' },
  (opts) => myAuthedFn.__executeServer(opts),
)
const myAuthedFn = createAuthServerFn().handler(
  myAuthedFn_createServerFn_handler,
  () => {
    return 'myAuthedFn'
  },
)
const deleteUserFn_createServerFn_handler = createServerRpc(
  {
    id: '_zazY1Jgzd8oXXcuPROEv9',
    name: 'deleteUserFn',
    filename: 'src/test.ts',
  },
  (opts) => deleteUserFn.__executeServer(opts),
)
const deleteUserFn = createAdminServerFn().handler(
  deleteUserFn_createServerFn_handler,
  () => {
    return 'deleteUserFn'
  },
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
export {
  myAuthedFn_createServerFn_handler,
  deleteUserFn_createServerFn_handler,
}
