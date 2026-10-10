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
export { adminMiddleware, authMiddleware, createAdminServerFn, createAuthServerFn };