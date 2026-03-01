import { createClientRpc } from '@tanstack/react-start/client-rpc';
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
}).handler(createClientRpc("eyJmaWxlIjoiL0BpZC9zcmMvdGVzdC50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJnZXRMb2NhbGVfY3JlYXRlU2VydmVyRm5faGFuZGxlciJ9"));
export const getUser = startInstance.createServerFn({
  method: 'GET'
}).middleware([authMiddleware]).handler(createClientRpc("eyJmaWxlIjoiL0BpZC9zcmMvdGVzdC50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJnZXRVc2VyX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ"));