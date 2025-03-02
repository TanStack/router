import React from 'react'
import { useTheme } from './theme'
import useMediaQuery from './useMediaQuery'
import type {
  AnyRootRoute,
  AnyRoute,
  AnyRouteMatch,
} from '@tanstack/react-router'

import type { Theme } from './theme'

export const isServer = typeof window === 'undefined'

type StyledComponent<T> = T extends 'button'
  ? React.DetailedHTMLProps<
      React.ButtonHTMLAttributes<HTMLButtonElement>,
      HTMLButtonElement
    >
  : T extends 'input'
    ? React.DetailedHTMLProps<
        React.InputHTMLAttributes<HTMLInputElement>,
        HTMLInputElement
      >
    : T extends 'select'
      ? React.DetailedHTMLProps<
          React.SelectHTMLAttributes<HTMLSelectElement>,
          HTMLSelectElement
        >
      : T extends keyof HTMLElementTagNameMap
        ? React.HTMLAttributes<HTMLElementTagNameMap[T]>
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
  route: AnyRoute | AnyRootRoute,
) {
  const found = matches.find((d) => d.routeId === route.id)
  if (!found) return 'gray'
  return getStatusColor(found)
}

type Styles =
  | React.CSSProperties
  | ((props: Record<string, any>, theme: Theme) => React.CSSProperties)

export function styled<T extends keyof HTMLElementTagNameMap>(
  type: T,
  newStyles: Styles,
  queries: Record<string, Styles> = {},
) {
  return React.forwardRef<HTMLElementTagNameMap[T], StyledComponent<T>>(
    ({ style, ...rest }, ref) => {
      const theme = useTheme()

      const mediaStyles = Object.entries(queries).reduce(
        (current, [key, value]) => {
          // eslint-disable-next-line react-hooks/rules-of-hooks
          return useMediaQuery(key)
            ? {
                ...current,
                ...(typeof value === 'function' ? value(rest, theme) : value),
              }
            : current
        },
        {},
      )

      return React.createElement(type, {
        ...rest,
        style: {
          ...(typeof newStyles === 'function'
            ? newStyles(rest, theme)
            : newStyles),
          ...style,
          ...mediaStyles,
        },
        ref,
      })
    },
  )
}

export function useIsMounted() {
  const [isMounted, setIsMounted] = React.useState(false)

  React[isServer ? 'useEffect' : 'useLayoutEffect'](() => {
    setIsMounted(true)
  }, [])

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
  const [state, setState] = React.useState(initialState)

  const safeSetState = React.useCallback(
    (value: T) => {
      scheduleMicrotask(() => {
        if (isMounted) {
          setState(value)
        }
      })
    },
    [isMounted],
  )

  return [state, safeSetState]
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
