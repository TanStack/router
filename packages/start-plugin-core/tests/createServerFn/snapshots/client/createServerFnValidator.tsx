import { createClientRpc } from '@tanstack/react-start/client-rpc';
import { createServerFn } from '@tanstack/react-start';
export const withUseServer = createServerFn({
  method: 'GET'
}).handler(createClientRpc("eyJmaWxlIjoiL0BpZC9zcmMvdGVzdC50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJ3aXRoVXNlU2VydmVyX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ"));