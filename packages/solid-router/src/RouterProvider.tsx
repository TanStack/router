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

  // Server-side, the provider owns the load dispatch: if the app (or a host
  // framework like Start) hasn't already loaded the router, kick `load()`
  // and park the render on it. Solid's SSR awaits parked reads natively, so
  // blocking-loader semantics are preserved without a top-level
  // `await router.load()` in the server entry. The memo exists on both
  // environments so the component tree (and hydration keys) stay identical;
  // on the client it resolves immediately and the boot is handled by the
  // registry priming in the Router constructor plus Transitioner's
  // settled-time load.
  const ready = Solid.createMemo(() =>
    (isServer ?? router.isServer) && !router._serverResult
      ? router.load().then(() => true)
      : true,
  )

  const OptionalWrapper = router.options.Wrap || SafeFragment

  return (
    <OptionalWrapper>
      <RouterContext value={router as AnyRouter}>
        <Solid.Show when={ready()}>
          {(_) => {
            // Native SSR transfer for the bare pairing (no-op under Start —
            // see registryTransfer): serialize settled match state into the
            // hydration registry while the render's serialization context is
            // live. Runs after the load gate so matches are committed. The
            // client half — the hydration-claiming boot — runs at router
            // creation, outside the render.
            if (isServer ?? router.isServer) {
              serializeMatchTransfer(router)
            }
            return children()
          }}
        </Solid.Show>
      </RouterContext>
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
