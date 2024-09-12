import * as React from 'react'
import { Matches } from './Matches'
import { getRouterContext } from './routerContext'
import type { NavigateOptions, ToOptions } from './link'
import type { ParsedLocation } from './location'
import type { RoutePaths } from './routeInfo'
import type {
  AnyRouter,
  RegisteredRouter,
  Router,
  RouterOptions,
} from './router'

export interface CommitLocationOptions {
  replace?: boolean
  resetScroll?: boolean
  viewTransition?: boolean
  /**
   * @deprecated All navigations use React transitions under the hood now
   **/
  startTransition?: boolean
  ignoreBlocker?: boolean
}

export interface MatchLocation {
  to?: string | number | null
  fuzzy?: boolean
  caseSensitive?: boolean
  from?: string
}

export type NavigateFn = <
  TRouter extends RegisteredRouter,
  TTo extends string | undefined,
  TFrom extends RoutePaths<TRouter['routeTree']> | string = string,
  TMaskFrom extends RoutePaths<TRouter['routeTree']> | string = TFrom,
  TMaskTo extends string = '',
>(
  opts: NavigateOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>,
) => Promise<void>

export type BuildLocationFn = <
  TRouter extends RegisteredRouter,
  TTo extends string | undefined,
  TFrom extends RoutePaths<TRouter['routeTree']> | string = string,
  TMaskFrom extends RoutePaths<TRouter['routeTree']> | string = TFrom,
  TMaskTo extends string = '',
>(
  opts: ToOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo> & {
    leaveParams?: boolean
  },
) => ParsedLocation

export type InjectedHtmlEntry = string | (() => Promise<string> | string)

export function RouterContextProvider<
  TRouter extends AnyRouter = RegisteredRouter,
  TDehydrated extends Record<string, any> = Record<string, any>,
>({
  router,
  children,
  ...rest
}: RouterProps<TRouter, TDehydrated> & {
  children: React.ReactNode
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
    <routerContext.Provider value={router}>{children}</routerContext.Provider>
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
      <Matches />
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
    TDehydrated
  >,
  'context'
> & {
  router: Router<
    TRouter['routeTree'],
    NonNullable<TRouter['options']['trailingSlash']>
  >
  context?: Partial<
    RouterOptions<
      TRouter['routeTree'],
      NonNullable<TRouter['options']['trailingSlash']>,
      TDehydrated
    >['context']
  >
}
