import { createClientRpc } from '@tanstack/react-start/client-rpc';
import { createServerFn as serverFn } from '@tanstack/react-start';
export const withUseServer = serverFn({
  method: 'GET'
}).handler(createClientRpc("eyJmaWxlIjoiL0BpZC9zcmMvdGVzdC50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJ3aXRoVXNlU2VydmVyX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ"));
export const withoutUseServer = serverFn({
  method: 'GET'
}).handler(createClientRpc("eyJmaWxlIjoiL0BpZC9zcmMvdGVzdC50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJ3aXRob3V0VXNlU2VydmVyX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ"));
export const withVariable = serverFn({
  method: 'GET'
}).handler(createClientRpc("eyJmaWxlIjoiL0BpZC9zcmMvdGVzdC50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJ3aXRoVmFyaWFibGVfY3JlYXRlU2VydmVyRm5faGFuZGxlciJ9"));
export const withZodValidator = serverFn({
  method: 'GET'
}).handler(createClientRpc("eyJmaWxlIjoiL0BpZC9zcmMvdGVzdC50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJ3aXRoWm9kVmFsaWRhdG9yX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ"));