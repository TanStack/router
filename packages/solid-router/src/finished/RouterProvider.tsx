import * as Solid from 'solid-js'
import { Dynamic } from 'solid-js/web'
import { Matches } from '../Matches'
import { getRouterContext } from './routerContext'
import type { NavigateOptions, ToOptions } from '.ParsePathParams, ./link'
import type { ParsedLocation } from '../common/location'
import type { RoutePaths } from '../routeInfo'
import type {
  AnyRouter,
  RegisteredRouter,
  Router,
  RouterOptions,
} from '../router'

export * from '../common/RouterProvider'

export type NavigateFn = <
  TRouter extends RegisteredRouter,
  TTo extends string | undefined,
  TFrom extends RoutePaths<TRouter['routeTree']> | string = string,
  TMaskFrom extends RoutePaths<TRouter['routeTree']> | string = TFrom,
  TMaskTo extends string = '',
>(
  opts: NavigateOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>,
) => Promise<void> | void

export type BuildLocationFn = <
  TRouter extends RegisteredRouter,
  TTo extends string | undefined,
  TFrom extends RoutePaths<TRouter['routeTree']> | string = string,
  TMaskFrom extends RoutePaths<TRouter['routeTree']> | string = TFrom,
  TMaskTo extends string = '',
>(
  opts: ToOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo> & {
    leaveParams?: boolean
    _includeValidateSearch?: boolean
  },
) => ParsedLocation

export type InjectedHtmlEntry = string | (() => Promise<string> | string)

export function RouterContextProvider<
  TRouter extends AnyRouter = RegisteredRouter,
  TDehydrated extends Record<string, any> = Record<string, any>,
>(props: RouterProps<TRouter, TDehydrated> & Solid.ParentProps) {
  const [local, rest] = Solid.splitProps(props, ['router', 'children'])
  // 	{
  //   router,
  //   children,
  //   ...rest
  // }
  // Allow the router to update options on the router instance

  Solid.createMemo(() => {
    local.router.update({
      ...local.router.options,
      ...rest,
      context: {
        ...local.router.options.context,
        ...rest.context,
      },
    } as any)
  })

  const routerContext = getRouterContext()

  const provider = (
    <routerContext.Provider value={local.router}>
      {local.children}
    </routerContext.Provider>
  )

  return (
    <Solid.Show when={local.router.options.Wrap} fallback={provider}>
      {(wrap) => <Dynamic component={wrap()}>{provider}</Dynamic>}
    </Solid.Show>
  )
}

export function RouterProvider<
  TRouter extends AnyRouter = RegisteredRouter,
  TDehydrated extends Record<string, any> = Record<string, any>,
>(props: RouterProps<TRouter, TDehydrated>) {
  const [local, rest] = Solid.splitProps(props, ['router'])
  return (
    <RouterContextProvider router={local.router} {...rest}>
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
