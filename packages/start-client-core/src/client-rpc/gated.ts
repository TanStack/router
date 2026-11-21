import { createClientRpc } from './createClientRpc'

/** The key of a stub's gate token on its RPC (`createGatedClientServerFn`). */
const gateTokenKey = /* @__PURE__ */ Symbol()

/**
 * `createClientServerFn` of a build with a custom `generateFunctionId`: the
 * stub also passes its gate token, a compile-only spelling the build looks
 * for in the client's emitted code to tell which server fns the client
 * calls (a custom id is any text). Stored on the RPC, non-enumerable (no
 * spread, serializer or request sees it), so that a minifier keeps it with
 * the stub: never read. In a subpath of its own (`client-rpc-gated`): the
 * client RPC module of an app without a generator is the one it was before
 * the gate (a bundler that mangles export names names them from the
 * module's exports).
 */
export const createGatedClientServerFn = <TFn>(
  functionId: string,
  builder: { handler: (rpc: ReturnType<typeof createClientRpc>) => TFn },
  token: string,
): TFn => {
  const rpc = createClientRpc(functionId)
  Object.defineProperty(rpc, gateTokenKey, { value: token })
  return builder.handler(rpc)
}
