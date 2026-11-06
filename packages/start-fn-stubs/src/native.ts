import type { IsomorphicFnBase } from './createIsomorphicFn'

export type {
  IsomorphicFn,
  ServerOnlyFn,
  ClientOnlyFn,
  IsomorphicFnBase,
} from './createIsomorphicFn'

// Resolved through the `react-native` export condition. Native client runtimes
// (the NativeScript HMR deps bundle) can evaluate Start packages without the
// Start compiler, so the uncompiled fallback must follow client semantics:
// `.client()` wins and server-only functions refuse to run.
type RuntimeFallbackFn = ((...args: Array<any>) => any) & {
  server: (serverImpl: (...args: Array<any>) => any) => RuntimeFallbackFn
  client: (clientImpl: (...args: Array<any>) => any) => RuntimeFallbackFn
}

function createRuntimeFn(
  fn: (...args: Array<any>) => any,
  clientImpl?: (...args: Array<any>) => any,
): RuntimeFallbackFn {
  return Object.assign(fn, {
    server: () => createRuntimeFn(clientImpl ?? (() => undefined), clientImpl),
    client: (nextClientImpl: (...args: Array<any>) => any) =>
      createRuntimeFn(nextClientImpl, nextClientImpl),
  })
}

export function createIsomorphicFn(): IsomorphicFnBase {
  return createRuntimeFn(() => undefined) as any
}

type EnvOnlyFn = <TFn extends (...args: Array<any>) => any>(fn: TFn) => TFn

export const createServerOnlyFn: EnvOnlyFn = (() => () => {
  throw new Error(
    'createServerOnlyFn() functions can only be called on the server!',
  )
}) as any

export const createClientOnlyFn: EnvOnlyFn = (fn) => fn
