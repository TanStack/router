import type {
  AnyRouter,
  Constrain,
  LooseReturnType,
  Register,
  Register as RouterRegister,
} from '@tanstack/router-core'

export interface DefaultRegister  {
  server: {
    requestContext: unknown
  }
  start: AnyStartConfig
}

declare module '@tanstack/router-core' {
    interface AdditionalRegister {
        start: AnyStartConfig
        server: {
            requestContext: unknown
        }
    }
    interface MetaRegister {
        router: 'start'
    }
  }



    
export type RegisteredStartConfig = Register['start']
export type RegisteredRequestContext = RouterRegister['server']['requestContext']
export type AnyStartConfig = StartConfig<any>
export interface CreateStartOptions {
  router: AnyRouter
}
export type ValidateStartOptions<TOptions> = Constrain<
  TOptions,
  () => CreateStartOptions
>
export const createStart = <TOptions>(
  options: ValidateStartOptions<TOptions>,
) => {
  return {} as unknown as StartConfig<TOptions>
}

export interface StartConfig<TOptions> {
  '~types': StartConfigTypes<TOptions>
}

export interface StartConfigTypes<TOptions> {
  options: TOptions
  router: ResolveStartRouter<TOptions>
}

export type ResolveStartRouter<TOptions> = unknown extends TOptions
  ? TOptions
  : LooseReturnType<TOptions> extends CreateStartOptions
    ? LooseReturnType<TOptions>['router']
    : never
