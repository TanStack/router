import * as Solid from 'solid-js'
import { isServer } from '@tanstack/router-core/isServer'
import { routerContext } from './routerContext'
import { SafeFragment } from './SafeFragment'
import { Matches } from './Matches'
import { serializeMatchTransfer } from './registryTransfer'
import type {
  AnyRouter,
  RegisteredRouter,
  RouterOptions,
} from '@tanstack/router-core'
import type { JSX } from '@solidjs/web'

const RouterContext = routerContext as unknown as Solid.Component<{
  value: any
  children: any
}>

export function RouterContextProvider<
  TRouter extends AnyRouter = RegisteredRouter,
  TDehydrated extends Record<string, any> = Record<string, any>,
>({
  router,
  children,
  ...rest
}: RouterProps<TRouter, TDehydrated> & {
  children: () => JSX.Element
}) {
  if (Object.keys(rest).length > 0) {
    Solid.runWithOwner(null, () => {
      router.update({
        ...router.options,
        ...rest,
        context: {
          ...router.options.context,
          ...rest.context,
        },
      } as any)
    })
  }

  // Native SSR transfer for the bare pairing (no-op under Start — see
  // registryTransfer): serialize settled match state into the hydration
  // registry while the render's serialization context is live. The client
  // half — the hydration-claiming boot — runs at router creation, outside
  // the render.
  if (isServer) {
    serializeMatchTransfer(router)
  }

  const OptionalWrapper = router.options.Wrap || SafeFragment

  return (
    <OptionalWrapper>
      <RouterContext value={router as AnyRouter}>{children()}</RouterContext>
    </OptionalWrapper>
  )
}

export function RouterProvider<
  TRouter extends AnyRouter = RegisteredRouter,
  TDehydrated extends Record<string, any> = Record<string, any>,
>({ router, ...rest }: RouterProps<TRouter, TDehydrated>) {
  return (
    <RouterContextProvider router={router} {...rest}>
      {() => <Matches />}
    </RouterContextProvider>
  )
}

export type RouterProps<
  TRouter extends AnyRouter = RegisteredRouter,
  TDehydrated extends Record<string, any> = Record<string, any>,
> = Omit<
  RouterOptions<
    TRouter['routeTree'],
    NonNullable<TRouter['options']['trailingSlash']>,
    false,
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
      false,
      TRouter['history'],
      TDehydrated
    >['context']
  >
}
