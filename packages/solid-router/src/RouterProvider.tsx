import { UnheadContext, createHead } from '@unhead/solid-js/client'
import { useContext } from 'solid-js'
import { isServer } from 'solid-js/web'
import { getRouterContext } from './routerContext'
import { SafeFragment } from './SafeFragment'
import { Matches } from './Matches'
import type {
  AnyRouter,
  RegisteredRouter,
  RouterOptions,
} from '@tanstack/router-core'
import type * as Solid from 'solid-js'

let clientHead: ReturnType<typeof createHead> | undefined

function HeadProvider(props: { children: () => Solid.JSX.Element }) {
  const existing = useContext(UnheadContext)
  if (existing || isServer) {
    return props.children()
  }
  clientHead ||= createHead()
  return (
    <UnheadContext.Provider value={clientHead}>
      {props.children()}
    </UnheadContext.Provider>
  )
}

export function RouterContextProvider<
  TRouter extends AnyRouter = RegisteredRouter,
  TDehydrated extends Record<string, any> = Record<string, any>,
>({
  router,
  children,
  ...rest
}: RouterProps<TRouter, TDehydrated> & {
  children: () => Solid.JSX.Element
}) {
  // Allow the router to update options on the router instance
  router.update({
    ...router.options,
    ...rest,
    context: {
      ...router.options.context,
      ...rest.context,
    },
  } as any)

  const routerContext = getRouterContext()

  const OptionalWrapper = router.options.Wrap || SafeFragment

  return (
    <OptionalWrapper>
      <HeadProvider>
        {() => (
          <routerContext.Provider value={router as AnyRouter}>
            {children()}
          </routerContext.Provider>
        )}
      </HeadProvider>
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
