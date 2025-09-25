import { createServerFn, createMiddleware } from '@tanstack/react-start';
const authMiddleware = createMiddleware({
  type: 'function'
});
const adminMiddleware = createMiddleware({
  type: 'function'
});
export const createAuthServerFn = createServerFn().middleware([authMiddleware]);
const createAdminServerFn = createAuthServerFn().middleware([adminMiddleware]);
export const myAuthedFn = createAuthServerFn().handler((opts, signal) => {
  "use server";

  return myAuthedFn.__executeServer(opts, signal);
});
export const deleteUserFn = createAdminServerFn().handler((opts, signal) => {
  "use server";

  return deleteUserFn.__executeServer(opts, signal);
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