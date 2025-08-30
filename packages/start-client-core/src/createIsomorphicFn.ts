// a function that can have different implementations on the client and server.
// implementations not provided will default to a no-op function.

export type IsomorphicFn<
  TArgs extends Array<any> = [],
  TServer = undefined,
  TClient = undefined,
> = (...args: TArgs) => TServer | TClient

export interface ServerOnlyFn<TArgs extends Array<any>, TServer>
  extends IsomorphicFn<TArgs, TServer> {
  client: <TClient>(
    clientImpl: (...args: TArgs) => TClient,
  ) => IsomorphicFn<TArgs, TServer, TClient>
}

export interface ClientOnlyFn<TArgs extends Array<any>, TClient>
  extends IsomorphicFn<TArgs, undefined, TClient> {
  server: <TServer>(
    serverImpl: (...args: TArgs) => TServer,
  ) => IsomorphicFn<TArgs, TServer, TClient>
}

export interface IsomorphicFnBase extends IsomorphicFn {
  server: <TArgs extends Array<any>, TServer>(
    serverImpl: (...args: TArgs) => TServer,
  ) => ServerOnlyFn<TArgs, TServer>
  client: <TArgs extends Array<any>, TClient>(
    clientImpl: (...args: TArgs) => TClient,
  ) => ClientOnlyFn<TArgs, TClient>
}

// this is a dummy function, it will be replaced by the transformer
// if we use `createIsomorphicFn` in this library itself, vite tries to execute it before the transformer runs
// therefore we must return a dummy function that allows calling `server` and `client` method chains.
export function createIsomorphicFn(): IsomorphicFnBase {
  return {
    server: () => ({ client: () => () => {} }),
    client: () => ({ server: () => () => {} }),
  } as any
}
