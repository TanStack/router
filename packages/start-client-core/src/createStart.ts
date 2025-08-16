import type {
  AnyRouter,
  AnyRouterConfig,
  Awaitable,
  Constrain,
  LooseReturnType,
  Register,
} from '@tanstack/router-core'
import type {
  AnyFunctionMiddleware,
  AnyRequestMiddleware,
} from './createMiddleware'

declare module '@tanstack/router-core' {
  interface AdditionalRegister {
    createStart: AnyStartConfig
    server: {
      requestContext: unknown
    }
  }
  interface MetaRegister {
    router: 'createStart'
    config: 'createStart'
  }
}

export type CreateStart<
  TCreateStartOptions extends CreateStartOptions = CreateStartOptions,
> = () => Awaitable<TCreateStartOptions>
export type RegisteredStartConfig = Register['createStart']
export type RegisteredRequestContext = Register['server']['requestContext']
export type AnyStartConfig = StartConfig<any>
export type AnyCreateStartOptions = CreateStartOptions<any>
export interface CreateStartOptions<
  TRouter extends AnyRouter = AnyRouter,
  TRouterConfig extends AnyRouterConfig = AnyRouterConfig,
> {
  router: TRouter
  config: TRouterConfig
  middlewares?: {
    request?: Array<AnyRequestMiddleware>
    function?: Array<AnyFunctionMiddleware>
  }
}
export type ValidateStartOptions<TOptions> = Constrain<
  TOptions,
  () => CreateStartOptions
>
export const defineStart = <TOptions>(
  createStart: ValidateStartOptions<TOptions>,
) => {
  return createStart as unknown as StartConfig<TOptions>
}

export type StartConfig<TOptions> = {
  '~types': StartConfigTypes<TOptions>
}

export interface StartConfigTypes<TOptions> {
  options: TOptions
  router: ResolveStartRouter<TOptions>
  config: ResolveRouterConfig<TOptions>
}

export type ResolveRouterConfig<TOptions> = unknown extends TOptions
  ? TOptions
  : LooseReturnType<TOptions> extends CreateStartOptions
    ? LooseReturnType<TOptions>['config']
    : never

export type ResolveStartRouter<TOptions> = unknown extends TOptions
  ? TOptions
  : LooseReturnType<TOptions> extends CreateStartOptions
    ? LooseReturnType<TOptions>['router']
    : never
