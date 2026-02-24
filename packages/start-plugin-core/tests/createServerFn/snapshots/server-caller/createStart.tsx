import { createSsrRpc } from '@tanstack/react-start/ssr-rpc';
import { createStart, createServerFn, createMiddleware } from '@tanstack/react-start';
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
export const startInstance = createStart(() => ({
  functionMiddleware: [authMiddleware]
}));
export const getLocale = startInstance.createServerFn({
  method: 'GET'
}).handler(createSsrRpc("eyJmaWxlIjoiL0BpZC9zcmMvdGVzdC50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJnZXRMb2NhbGVfY3JlYXRlU2VydmVyRm5faGFuZGxlciJ9", () => import("/test/src/test.ts?tss-serverfn-split").then(m => m["getLocale_createServerFn_handler"])));
export const getUser = startInstance.createServerFn({
  method: 'GET'
}).middleware([authMiddleware]).handler(createSsrRpc("eyJmaWxlIjoiL0BpZC9zcmMvdGVzdC50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJnZXRVc2VyX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ", () => import("/test/src/test.ts?tss-serverfn-split").then(m => m["getUser_createServerFn_handler"])));