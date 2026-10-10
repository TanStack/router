import { getEcho, getEnv } from "./test.ts?tss-serverfn-shared";
import { createServerRpc } from '@tanstack/react-start/server-rpc';
import { createServerFn } from '@tanstack/react-start';
const getServerEnv_createServerFn_handler = createServerRpc({
  id: "6049dd46bc00e0980e387f3e74924b40e92f37634a3fe74a1a1facda9e9207c2",
  name: "getServerEnv",
  filename: "src/test.ts"
}, opts => getServerEnv.__executeServer(opts));
const getServerEnv = createServerFn().handler(getServerEnv_createServerFn_handler, () => getEnv());
const getServerEcho_createServerFn_handler = createServerRpc({
  id: "ebb82e0293952b7b1dde3f664dec4c139471c046d06d4dc4ca172f4f45e386d1",
  name: "getServerEcho",
  filename: "src/test.ts"
}, opts => getServerEcho.__executeServer(opts));
const getServerEcho = createServerFn().validator((input: string) => input).handler(getServerEcho_createServerFn_handler, ({
  data
}) => getEcho(data));
export { getServerEnv_createServerFn_handler, getServerEcho_createServerFn_handler };