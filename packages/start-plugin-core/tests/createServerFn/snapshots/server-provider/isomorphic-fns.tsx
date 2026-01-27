import { createServerRpc } from '@tanstack/react-start/server-rpc';
import { createIsomorphicFn, createServerFn } from '@tanstack/react-start';
const getEnv = createIsomorphicFn().server(() => 'server').client(() => 'client');
const getServerEnv_createServerFn_handler = createServerRpc({
  id: "eyJmaWxlIjoiL0BpZC9zcmMvdGVzdC50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJnZXRTZXJ2ZXJFbnZfY3JlYXRlU2VydmVyRm5faGFuZGxlciJ9",
  name: "getServerEnv",
  filename: "src/test.ts"
}, (opts, signal) => getServerEnv.__executeServer(opts, signal));
const getServerEnv = createServerFn().handler(getServerEnv_createServerFn_handler, () => getEnv());
const getEcho = createIsomorphicFn().server((input: string) => 'server received ' + input).client(input => 'client received ' + input);
const getServerEcho_createServerFn_handler = createServerRpc({
  id: "eyJmaWxlIjoiL0BpZC9zcmMvdGVzdC50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJnZXRTZXJ2ZXJFY2hvX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ",
  name: "getServerEcho",
  filename: "src/test.ts"
}, (opts, signal) => getServerEcho.__executeServer(opts, signal));
const getServerEcho = createServerFn().inputValidator((input: string) => input).handler(getServerEcho_createServerFn_handler, ({
  data
}) => getEcho(data));
export { getServerEnv_createServerFn_handler, getServerEcho_createServerFn_handler };