import { createServerRpc } from '@tanstack/react-start/server-rpc';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
const withUseServer_createServerFn_handler = createServerRpc({
  id: "eyJmaWxlIjoiL0BpZC9zcmMvdGVzdC50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJ3aXRoVXNlU2VydmVyX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ",
  name: "withUseServer",
  filename: "src/test.ts"
}, (opts, signal) => withUseServer.__executeServer(opts, signal));
const withUseServer = createServerFn({
  method: 'GET'
}).inputValidator(z.number()).handler(withUseServer_createServerFn_handler, ({
  input
}) => input + 1);
export { withUseServer_createServerFn_handler };