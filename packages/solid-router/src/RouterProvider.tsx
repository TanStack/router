import { Matches } from './Matches'
import { getRouterContext } from './routerContext'
import type * as Solid from 'solid-js'
import type {
  AnyRouter,
  RegisteredRouter,
  Router,
  RouterOptions,
} from './router'

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

  const provider = (
    <routerContext.Provider value={router as AnyRouter}>
      {children()}
    </routerContext.Provider>
  )

  if (router.options.Wrap) {
    return <router.options.Wrap>{provider}</router.options.Wrap>
  }

  return provider
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
    TRouter['history'],
    TDehydrated
  >,
  'context'
> & {
  router: Router<
    TRouter['routeTree'],
    NonNullable<TRouter['options']['trailingSlash']>,
    TRouter['history']
  >
  context?: Partial<
    RouterOptions<
      TRouter['routeTree'],
      NonNullable<TRouter['options']['trailingSlash']>,
      TRouter['history'],
      TDehydrated
    >['context']
  >
}
