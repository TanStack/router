import { createServerRpc } from '@tanstack/react-start/server-rpc';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
const withUseServer_createServerFn_handler = createServerRpc("eyJmaWxlIjoiL0BpZC90ZXN0LnRzP3Rzcy1zZXJ2ZXJmbi1zcGxpdCIsImV4cG9ydCI6IndpdGhVc2VTZXJ2ZXJfY3JlYXRlU2VydmVyRm5faGFuZGxlciJ9", (opts, signal) => withUseServer.__executeServer(opts, signal));
const withUseServer = createServerFn({
  method: 'GET'
}).inputValidator(z.number()).handler(withUseServer_createServerFn_handler, ({
  input
}) => input + 1);
export { withUseServer_createServerFn_handler };