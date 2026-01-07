import { createSsrRpc } from '@tanstack/react-start/ssr-rpc';
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
export const myAuthedFn = createAuthServerFn().handler(createSsrRpc("eyJmaWxlIjoiL0BpZC90ZXN0LnRzP3Rzcy1zZXJ2ZXJmbi1zcGxpdCIsImV4cG9ydCI6Im15QXV0aGVkRm5fY3JlYXRlU2VydmVyRm5faGFuZGxlciJ9", () => import("test.ts?tss-serverfn-split").then(m => m["myAuthedFn_createServerFn_handler"])));
export const deleteUserFn = createAdminServerFn().handler(createSsrRpc("eyJmaWxlIjoiL0BpZC90ZXN0LnRzP3Rzcy1zZXJ2ZXJmbi1zcGxpdCIsImV4cG9ydCI6ImRlbGV0ZVVzZXJGbl9jcmVhdGVTZXJ2ZXJGbl9oYW5kbGVyIn0", () => import("test.ts?tss-serverfn-split").then(m => m["deleteUserFn_createServerFn_handler"])));
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