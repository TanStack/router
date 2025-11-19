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
export const createAuthServerFn = createServerFn().middleware([authMiddleware]);
const createAdminServerFn = createAuthServerFn().middleware([adminMiddleware]);
export const myAuthedFn = createAuthServerFn().handler((opts, signal) => {
  "use server";

  return myAuthedFn.__executeServer(opts, signal);
}, () => {
  return 'myAuthedFn';
});
export const deleteUserFn = createAdminServerFn().handler((opts, signal) => {
  "use server";

  return deleteUserFn.__executeServer(opts, signal);
}, () => {
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