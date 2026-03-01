import { createServerRpc } from '@tanstack/react-start/server-rpc';
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
const startInstance = createStart(() => ({
  functionMiddleware: [authMiddleware]
}));
const getLocale_createServerFn_handler = createServerRpc({
  id: "eyJmaWxlIjoiL0BpZC9zcmMvdGVzdC50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJnZXRMb2NhbGVfY3JlYXRlU2VydmVyRm5faGFuZGxlciJ9",
  name: "getLocale",
  filename: "src/test.ts"
}, opts => getLocale.__executeServer(opts));
const getLocale = startInstance.createServerFn({
  method: 'GET'
}).handler(getLocale_createServerFn_handler, ({
  context
}) => {
  return {
    locale: context.locale
  };
});
const getUser_createServerFn_handler = createServerRpc({
  id: "eyJmaWxlIjoiL0BpZC9zcmMvdGVzdC50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJnZXRVc2VyX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ",
  name: "getUser",
  filename: "src/test.ts"
}, opts => getUser.__executeServer(opts));
const getUser = startInstance.createServerFn({
  method: 'GET'
}).middleware([authMiddleware]).handler(getUser_createServerFn_handler, ({
  context
}) => {
  return {
    user: context.auth
  };
});
export { getLocale_createServerFn_handler, getUser_createServerFn_handler };