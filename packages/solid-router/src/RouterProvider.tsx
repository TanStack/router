import { getRouterContext } from './routerContext'
import { SafeFragment } from './SafeFragment'
import { Matches } from './Matches'
import type {
  AnyRouter,
  Register,
  RegisteredRouter,
  RouterOptions,
} from '@tanstack/router-core'
import type * as Solid from 'solid-js'

export function RouterContextProvider<
  TRegister extends Register = Register,
  TDehydrated extends Record<string, any> = Record<string, any>,
>({
  router,
  children,
  ...rest
}: RouterProps<TRegister, TDehydrated> & {
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
      <routerContext.Provider value={router as AnyRouter}>
        {children()}
      </routerContext.Provider>
    </OptionalWrapper>
  )
}

export function RouterProvider<
  TRegister extends Register = Register,
  TDehydrated extends Record<string, any> = Record<string, any>,
>({ router, ...rest }: RouterProps<TRegister, TDehydrated>) {
  return (
    <RouterContextProvider router={router} {...rest}>
      {() => <Matches />}
    </RouterContextProvider>
  )
}

export type RouterProps<
  TRegister extends Register = Register,
  TDehydrated extends Record<string, any> = Record<string, any>,
> = Omit<
  RouterOptions<
    RegisteredRouter<TRegister>['routeTree'],
    NonNullable<RegisteredRouter<TRegister>['options']['trailingSlash']>,
    false,
    RegisteredRouter<TRegister>['history'],
    TDehydrated
  >,
  'context'
> & {
  router: RegisteredRouter<TRegister>
  context?: Partial<
    RouterOptions<
      RegisteredRouter<TRegister>['routeTree'],
      NonNullable<RegisteredRouter<TRegister>['options']['trailingSlash']>,
      false,
      RegisteredRouter<TRegister>['history'],
      TDehydrated
    >['context']
  >
}
