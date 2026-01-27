import { createServerRpc } from '@tanstack/react-start/server-rpc';
import { createServerFn, createMiddleware } from '@tanstack/react-start';
const authMiddleware = createMiddleware({
  type: 'function'
}).server(({
  next
}) => {
  return next({
    context: {
      auth: 'auth'
    }
  });
});
const adminMiddleware = createMiddleware({
  type: 'function'
}).server(({
  next
}) => {
  return next({
    context: {
      admin: 'admin'
    }
  });
});
const createAuthServerFn = createServerFn().middleware([authMiddleware]);
const createAdminServerFn = createAuthServerFn().middleware([adminMiddleware]);
const myAuthedFn_createServerFn_handler = createServerRpc({
  id: "eyJmaWxlIjoiL0BpZC9zcmMvdGVzdC50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJteUF1dGhlZEZuX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ",
  name: "myAuthedFn",
  filename: "src/test.ts"
}, (opts, signal) => myAuthedFn.__executeServer(opts, signal));
const myAuthedFn = createAuthServerFn().handler(myAuthedFn_createServerFn_handler, () => {
  return 'myAuthedFn';
});
const deleteUserFn_createServerFn_handler = createServerRpc({
  id: "eyJmaWxlIjoiL0BpZC9zcmMvdGVzdC50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJkZWxldGVVc2VyRm5fY3JlYXRlU2VydmVyRm5faGFuZGxlciJ9",
  name: "deleteUserFn",
  filename: "src/test.ts"
}, (opts, signal) => deleteUserFn.__executeServer(opts, signal));
const deleteUserFn = createAdminServerFn().handler(deleteUserFn_createServerFn_handler, () => {
  return 'deleteUserFn';
});
function createFakeFn() {
  return {
    handler: cb => {
      return cb();
    }
  };
}
const x = createFakeFn().handler(() => {
  return 'fakeFn';
});
export { myAuthedFn_createServerFn_handler, deleteUserFn_createServerFn_handler };