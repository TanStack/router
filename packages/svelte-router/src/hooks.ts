import warning from 'tiny-warning'
import { setContext, getContext } from 'svelte'
import { Readable, derived, get } from 'svelte/store'
import {
  RegisteredRoutesInfo,
  RegisteredRouter,
  LinkOptions,
  Router,
  RouteMatch,
} from '@tanstack/router-core'
import { useStore } from '@tanstack/react-store'
import { HTMLAnchorAttributes, HTMLAttributes } from 'svelte/elements'

const routerContextKey = Symbol('router')

export function registerRouterContext(routerStore: Readable<Router>) {
  setContext(routerStore, routerContextKey)
}

export function useRouter(): Readable<RegisteredRouter> {
  const value: Readable<RegisteredRouter> = getContext(routerContextKey)
  warning(value, 'useRouter must be used inside a <Router> component!')
  return value
}

export function useRouterState<TSelected = RegisteredRouter['state']>(opts?: {
  select: (state: RegisteredRouter['state']) => TSelected
}): Readable<TSelected> {
  const routerStore = useRouter()
  return derived(routerStore, ($router) => {
    return useStore($router.__store, opts?.select)
  })
}

const matchesContextKey = Symbol('matches')
type Matches = string[]

export function registerMatchesContext(matchesStore: Readable<Matches>) {
  setContext(matchesStore, matchesContextKey)
}

export function getMatchIdsStore(): Readable<Matches> {
  return getContext(matchesContextKey)
}

export function useMatches<T = RouteMatch[]>(opts?: {
  select?: (matches: RouteMatch[]) => T
}): Readable<T> {
  const matchIdsStore = getMatchIdsStore()
  return derived(matchIdsStore, ($matchIds) => {
    useRouterState({
      select: (state) => {
        const matches = state.matches.slice(
          state.matches.findIndex((d: { id: string }) => d.id === $matchIds[0]),
        )
        return (opts?.select?.(matches) ?? matches) as T
      },
    })
  })
}

export type LinkPropsOptions<
  TFrom extends RegisteredRoutesInfo['routePaths'] = '/',
  TTo extends string = '',
> = LinkOptions<RegisteredRoutesInfo, TFrom, TTo> & {
  // A function that returns additional props for the `active` state of this link. These props override other props passed to the link (`style`'s are merged, `className`'s are concatenated)
  activeProps?: HTMLAnchorAttributes | (() => HTMLAnchorAttributes)
  // A function that returns additional props for the `inactive` state of this link. These props override other props passed to the link (`style`'s are merged, `className`'s are concatenated)
  inactiveProps?:
    | HTMLAttributes<HTMLAnchorElement>
    | (() => HTMLAnchorAttributes)
  startTransition?: boolean
}

export type MakeLinkPropsOptions<
  TFrom extends string = '/',
  TTo extends string = '',
> = LinkPropsOptions<TFrom, TTo> & HTMLAnchorAttributes

export type MakeLinkOptions<
  TFrom extends RegisteredRoutesInfo['routePaths'] = '/',
  TTo extends string = '',
> = LinkPropsOptions<TFrom, TTo> & Omit<HTMLAnchorAttributes, 'children'> & {}

export function useLinkProps<
  TFrom extends string = '/',
  TTo extends string = '',
>(options: MakeLinkPropsOptions<TFrom, TTo>): HTMLAnchorAttributes {
  const router = get(useRouter())

  const linkInfo = router.buildLink(options as any)

  if (linkInfo.type === 'external') {
    const { href } = linkInfo
    return { href }
  }

  const {
    handleClick,
    handleFocus,
    handleEnter,
    handleLeave,
    handleTouchStart,
    next,
  } = linkInfo

  return {
    href: next.href,
    'on:click': handleClick,
    'on:focus': handleFocus,
    'on:mouseenter': handleEnter,
    'on:mouseleave': handleLeave,
    'on:touchstart': handleTouchStart,
  }
}
