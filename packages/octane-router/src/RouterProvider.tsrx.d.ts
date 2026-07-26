import type {
  AnyRouter,
  RegisteredRouter,
  RouterOptions,
} from '@tanstack/router-core'

export type RouterProps<
  TRouter extends AnyRouter = RegisteredRouter,
  TDehydrated extends Record<string, unknown> = Record<string, unknown>,
> = Omit<
  RouterOptions<
    TRouter['routeTree'],
    NonNullable<TRouter['options']['trailingSlash']>,
    NonNullable<TRouter['options']['defaultStructuralSharing']>,
    TRouter['history'],
    TDehydrated
  >,
  'context'
> & {
  router: TRouter
  context?: Partial<
    RouterOptions<
      TRouter['routeTree'],
      NonNullable<TRouter['options']['trailingSlash']>,
      NonNullable<TRouter['options']['defaultStructuralSharing']>,
      TRouter['history'],
      TDehydrated
    >['context']
  >
}

export declare function RouterProvider<
  TRouter extends AnyRouter = RegisteredRouter,
  TDehydrated extends Record<string, unknown> = Record<string, unknown>,
>(props: RouterProps<TRouter, TDehydrated>): void

export declare function RouterContextProvider<
  TRouter extends AnyRouter = RegisteredRouter,
  TDehydrated extends Record<string, unknown> = Record<string, unknown>,
>(props: RouterProps<TRouter, TDehydrated> & { children?: unknown }): void
