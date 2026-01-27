import { createSsrRpc } from '@tanstack/react-start/ssr-rpc';
import { createServerFn as serverFn } from '@tanstack/react-start';
export const withUseServer = serverFn({
  method: 'GET'
}).handler(createSsrRpc("eyJmaWxlIjoiL0BpZC9zcmMvdGVzdC50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJ3aXRoVXNlU2VydmVyX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ", () => import("/test/src/test.ts?tss-serverfn-split").then(m => m["withUseServer_createServerFn_handler"])));
export const withoutUseServer = serverFn({
  method: 'GET'
}).handler(createSsrRpc("eyJmaWxlIjoiL0BpZC9zcmMvdGVzdC50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJ3aXRob3V0VXNlU2VydmVyX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ", () => import("/test/src/test.ts?tss-serverfn-split").then(m => m["withoutUseServer_createServerFn_handler"])));
export const withVariable = serverFn({
  method: 'GET'
}).handler(createSsrRpc("eyJmaWxlIjoiL0BpZC9zcmMvdGVzdC50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJ3aXRoVmFyaWFibGVfY3JlYXRlU2VydmVyRm5faGFuZGxlciJ9", () => import("/test/src/test.ts?tss-serverfn-split").then(m => m["withVariable_createServerFn_handler"])));
export const withZodValidator = serverFn({
  method: 'GET'
}).handler(createSsrRpc("eyJmaWxlIjoiL0BpZC9zcmMvdGVzdC50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJ3aXRoWm9kVmFsaWRhdG9yX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ", () => import("/test/src/test.ts?tss-serverfn-split").then(m => m["withZodValidator_createServerFn_handler"])));