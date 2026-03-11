import { createClientRpc } from '@tanstack/react-start/client-rpc';
import * as TanStackStart from '@tanstack/react-start';
export const withUseServer = TanStackStart.createServerFn({
  method: 'GET'
}).handler(createClientRpc("eyJmaWxlIjoiL0BpZC9zcmMvdGVzdC50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJ3aXRoVXNlU2VydmVyX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ"));
export const withoutUseServer = TanStackStart.createServerFn({
  method: 'GET'
}).handler(createClientRpc("eyJmaWxlIjoiL0BpZC9zcmMvdGVzdC50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJ3aXRob3V0VXNlU2VydmVyX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ"));
export const withVariable = TanStackStart.createServerFn({
  method: 'GET'
}).handler(createClientRpc("eyJmaWxlIjoiL0BpZC9zcmMvdGVzdC50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJ3aXRoVmFyaWFibGVfY3JlYXRlU2VydmVyRm5faGFuZGxlciJ9"));
export const withZodValidator = TanStackStart.createServerFn({
  method: 'GET'
}).handler(createClientRpc("eyJmaWxlIjoiL0BpZC9zcmMvdGVzdC50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJ3aXRoWm9kVmFsaWRhdG9yX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ"));