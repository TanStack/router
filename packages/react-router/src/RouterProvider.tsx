import * as React from 'react'
import { Matches } from './Matches'
import { getRouterContext } from './routerContext'
import type {
  AnyRouter,
  Register,
  RegisteredRouter,
  RouterOptions,
} from '@tanstack/router-core'

/**
 * Low-level provider that places the router into React context and optionally
 * updates router options from props. Most apps should use `RouterProvider`.
 */
export function RouterContextProvider<
  TRegister extends Register = Register,
  TDehydrated extends Record<string, any> = Record<string, any>,
>({
  router,
  children,
  ...rest
}: RouterProps<TRegister, TDehydrated> & {
  children: React.ReactNode
}) {
  if (Object.keys(rest).length > 0) {
    // Allow the router to update options on the router instance
    router.update({
      ...router.options,
      ...rest,
      context: {
        ...router.options.context,
        ...rest.context,
      },
    } as any)
  }

  const routerContext = getRouterContext()

  const provider = (
    <routerContext.Provider value={router as AnyRouter}>
      {children}
    </routerContext.Provider>
  )

  if (router.options.Wrap) {
    return <router.options.Wrap>{provider}</router.options.Wrap>
  }

  return provider
}

/**
 * Top-level component that renders the active route matches and provides the
 * router to the React tree via context.
 *
 * Accepts the same options as `createRouter` via props to update the router
 * instance after creation.
 *
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/createRouterFunction
 */
export function RouterProvider<
  TRegister extends Register = Register,
  TDehydrated extends Record<string, any> = Record<string, any>,
>({ router, ...rest }: RouterProps<TRegister, TDehydrated>) {
  return (
    <RouterContextProvider router={router} {...rest}>
      <Matches />
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
    NonNullable<
      RegisteredRouter<TRegister>['options']['defaultStructuralSharing']
    >,
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
      NonNullable<
        RegisteredRouter<TRegister>['options']['defaultStructuralSharing']
      >,
      RegisteredRouter<TRegister>['history'],
      TDehydrated
    >['context']
  >
}
