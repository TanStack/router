import { Dynamic } from 'solid-js/web'
import { createEffect, createRenderEffect, createSignal } from 'solid-js'
import { useTheme } from './theme'
import useMediaQuery from './useMediaQuery'
import type { AnyRoute, AnyRouteMatch } from '@tanstack/router-core'

import type { Theme } from './theme'
import type { JSX } from 'solid-js'

export const isServer = typeof window === 'undefined'

type StyledComponent<T> = T extends 'button'
  ? JSX.ButtonHTMLAttributes<HTMLButtonElement>
  : T extends 'input'
    ? JSX.InputHTMLAttributes<HTMLInputElement>
    : T extends 'select'
      ? JSX.SelectHTMLAttributes<HTMLSelectElement>
      : T extends keyof HTMLElementTagNameMap
        ? JSX.HTMLAttributes<HTMLElementTagNameMap[T]>
        : never

export function getStatusColor(match: AnyRouteMatch) {
  const colorMap = {
    pending: 'yellow',
    success: 'green',
    error: 'red',
    notFound: 'purple',
    redirected: 'gray',
  } as const

  return match.isFetching && match.status === 'success'
    ? match.isFetching === 'beforeLoad'
      ? 'purple'
      : 'blue'
    : colorMap[match.status]
}

export function getRouteStatusColor(
  matches: Array<AnyRouteMatch>,
  route: AnyRoute,
) {
  const found = matches.find((d) => d.routeId === route.id)
  if (!found) return 'gray'
  return getStatusColor(found)
}

type Styles =
  | JSX.CSSProperties
  | ((props: Record<string, any>, theme: Theme) => JSX.CSSProperties)

export function styled<T extends keyof HTMLElementTagNameMap>(
  type: T,
  newStyles: Styles,
  queries: Record<string, Styles> = {},
) {
  return ({
    ref,
    style,
    ...rest
  }: StyledComponent<T> & {
    ref?: HTMLElementTagNameMap[T] | undefined
  }) => {
    const theme = useTheme()

    const mediaStyles = Object.entries(queries).reduce(
      (current, [key, value]) => {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        return useMediaQuery(key)
          ? {
              ...current,
              ...(typeof value === 'function' ? value(rest, theme) : value),
            }
          : current
      },
      {},
    )

    const baseStyles =
      typeof newStyles === 'function' ? newStyles(rest, theme) : newStyles

    // Handle style being either a string or an object
    const combinedStyles =
      typeof style === 'string'
        ? { ...baseStyles, ...mediaStyles, cssText: style }
        : { ...baseStyles, ...style, ...mediaStyles }

    return (
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      <Dynamic component={type} {...rest} style={combinedStyles} ref={ref} />
    )
  }
}

export function useIsMounted() {
  const [isMounted, setIsMounted] = createSignal(false)

  const effect = isServer ? createEffect : createRenderEffect

  effect(() => {
    setIsMounted(true)
  })

  return isMounted
}

/**
 * Displays a string regardless the type of the data
 * @param {unknown} value Value to be stringified
 */
export const displayValue = (value: unknown) => {
  const name = Object.getOwnPropertyNames(Object(value))
  const newValue = typeof value === 'bigint' ? `${value.toString()}n` : value
  try {
    return JSON.stringify(newValue, name)
  } catch (e) {
    return `unable to stringify`
  }
}

/**
 * This hook is a safe useState version which schedules state updates in microtasks
 * to prevent updating a component state while React is rendering different components
 * or when the component is not mounted anymore.
 */
export function useSafeState<T>(initialState: T): [T, (value: T) => void] {
  const isMounted = useIsMounted()
  const [state, setState] = createSignal(initialState)

  const safeSetState = (value: T) => {
    scheduleMicrotask(() => {
      if (isMounted()) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        setState(value)
      }
    })
  }

  return [state(), safeSetState]
}

/**
 * Schedules a microtask.
 * This can be useful to schedule state updates after rendering.
 */
function scheduleMicrotask(callback: () => void) {
  Promise.resolve()
    .then(callback)
    .catch((error) =>
      setTimeout(() => {
        throw error
      }),
    )
}

export function multiSortBy<T>(
  arr: Array<T>,
  accessors: Array<(item: T) => any> = [(d) => d],
): Array<T> {
  return arr
    .map((d, i) => [d, i] as const)
    .sort(([a, ai], [b, bi]) => {
      for (const accessor of accessors) {
        const ao = accessor(a)
        const bo = accessor(b)

        if (typeof ao === 'undefined') {
          if (typeof bo === 'undefined') {
            continue
          }
          return 1
        }

        if (ao === bo) {
          continue
        }

        return ao > bo ? 1 : -1
      }

      return ai - bi
    })
    .map(([d]) => d)
}
