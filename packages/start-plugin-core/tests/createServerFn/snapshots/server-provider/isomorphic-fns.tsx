import { createServerRpc } from '@tanstack/react-start/server-rpc';
import { createIsomorphicFn, createServerFn } from '@tanstack/react-start';
const getEnv = createIsomorphicFn().server(() => 'server').client(() => 'client');
const getServerEnv_createServerFn_handler = createServerRpc("eyJmaWxlIjoiL0BpZC90ZXN0LnRzP3Rzcy1zZXJ2ZXJmbi1zcGxpdCIsImV4cG9ydCI6ImdldFNlcnZlckVudl9jcmVhdGVTZXJ2ZXJGbl9oYW5kbGVyIn0", (opts, signal) => getServerEnv.__executeServer(opts, signal));
const getServerEnv = createServerFn().handler(getServerEnv_createServerFn_handler, () => getEnv());
const getEcho = createIsomorphicFn().server((input: string) => 'server received ' + input).client(input => 'client received ' + input);
const getServerEcho_createServerFn_handler = createServerRpc("eyJmaWxlIjoiL0BpZC90ZXN0LnRzP3Rzcy1zZXJ2ZXJmbi1zcGxpdCIsImV4cG9ydCI6ImdldFNlcnZlckVjaG9fY3JlYXRlU2VydmVyRm5faGFuZGxlciJ9", (opts, signal) => getServerEcho.__executeServer(opts, signal));
const getServerEcho = createServerFn().inputValidator((input: string) => input).handler(getServerEcho_createServerFn_handler, ({
  data
}) => getEcho(data));
export { getServerEnv_createServerFn_handler, getServerEcho_createServerFn_handler };