import * as React from 'react'
import { Pressable, Text, StyleSheet } from 'react-native'
import { deepEqual, exactPathTest, functionalUpdate, removeTrailingSlash } from '@tanstack/router-core'
import { useRouterState } from './useRouterState'
import { useRouter } from './useRouter'
import type {
  AnyRouter,
  LinkOptions,
  RegisteredRouter,
  RoutePaths,
} from '@tanstack/router-core'
import type {
  PressableProps,
  StyleProp,
  ViewStyle,
  TextStyle,
  GestureResponderEvent,
} from 'react-native'

export interface ActiveLinkOptions {
  /**
   * Props applied when the link is active
   */
  activeProps?: {
    style?: StyleProp<ViewStyle>
    textStyle?: StyleProp<TextStyle>
  }
  /**
   * Props applied when the link is inactive
   */
  inactiveProps?: {
    style?: StyleProp<ViewStyle>
    textStyle?: StyleProp<TextStyle>
  }
  /**
   * Options for determining if the link is active
   */
  activeOptions?: {
    exact?: boolean
    includeSearch?: boolean
    includeHash?: boolean
    explicitUndefined?: boolean
  }
}

export type NativeLinkProps<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends RoutePaths<TRouter['routeTree']> | string = string,
  TTo extends string | undefined = '.',
  TMaskFrom extends RoutePaths<TRouter['routeTree']> | string = TFrom,
  TMaskTo extends string = '.',
> = LinkOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo> &
  ActiveLinkOptions &
  Omit<PressableProps, 'onPress' | 'disabled' | 'children'> & {
    /**
     * Children to render inside the link
     */
    children?:
      | React.ReactNode
      | ((state: { isActive: boolean; isTransitioning: boolean }) => React.ReactNode)
    /**
     * Style for the text when children is a string
     */
    textStyle?: StyleProp<TextStyle>
    /**
     * Whether the link is disabled
     */
    disabled?: boolean
    /**
     * Custom onPress handler (called before navigation)
     */
    onPress?: (e: GestureResponderEvent) => void
  }

/**
 * Hook that returns props for creating a native link
 */
export function useNativeLinkProps<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TTo extends string | undefined = undefined,
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '',
>(
  options: NativeLinkProps<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>,
) {
  const router = useRouter()
  const [isTransitioning, setIsTransitioning] = React.useState(false)

  const {
    activeProps,
    inactiveProps,
    activeOptions,
    to,
    disabled,
    onPress: userOnPress,
    replace,
    resetScroll,
    viewTransition,
    ignoreBlocker,
    params: _params,
    search: _search,
    hash: _hash,
    state: _state,
    mask: _mask,
    from: _from,
    ...pressableProps
  } = options

  const from = options.from

  const _options = React.useMemo(
    () => ({ ...options, from }),
    [options, from],
  )

  const next = React.useMemo(
    () => router.buildLocation({ ..._options } as any),
    [router, _options],
  )

  const isActive = useRouterState({
    select: (s) => {
      if (activeOptions?.exact) {
        const testExact = exactPathTest(
          s.location.pathname,
          next.pathname,
          router.basepath,
        )
        if (!testExact) return false
      } else {
        const currentPathSplit = removeTrailingSlash(
          s.location.pathname,
          router.basepath,
        )
        const nextPathSplit = removeTrailingSlash(
          next.pathname,
          router.basepath,
        )

        const pathIsFuzzyEqual =
          currentPathSplit.startsWith(nextPathSplit) &&
          (currentPathSplit.length === nextPathSplit.length ||
            currentPathSplit[nextPathSplit.length] === '/')

        if (!pathIsFuzzyEqual) return false
      }

      if (activeOptions?.includeSearch ?? true) {
        const searchTest = deepEqual(s.location.search, next.search, {
          partial: !activeOptions?.exact,
          ignoreUndefined: !activeOptions?.explicitUndefined,
        })
        if (!searchTest) return false
      }

      if (activeOptions?.includeHash) {
        return s.location.hash === next.hash
      }

      return true
    },
  })

  const handlePress = React.useCallback(
    (e: GestureResponderEvent) => {
      if (disabled) return

      userOnPress?.(e)

      setIsTransitioning(true)

      const unsub = router.subscribe('onResolved', () => {
        unsub()
        setIsTransitioning(false)
      })

      router.navigate({
        ..._options,
        replace,
        resetScroll,
        viewTransition,
        ignoreBlocker,
      } as any)
    },
    [disabled, userOnPress, router, _options, replace, resetScroll, viewTransition, ignoreBlocker],
  )

  const resolvedActiveProps = isActive
    ? functionalUpdate(activeProps, {})
    : {}

  const resolvedInactiveProps = isActive
    ? {}
    : functionalUpdate(inactiveProps, {})

  return {
    onPress: handlePress,
    disabled: !!disabled,
    isActive,
    isTransitioning,
    activeProps: resolvedActiveProps,
    inactiveProps: resolvedInactiveProps,
    pressableProps,
  }
}

/**
 * A pressable link component for React Native that navigates to a route.
 */
export const Link = React.forwardRef<
  React.ElementRef<typeof Pressable>,
  NativeLinkProps
>(function LinkImpl(props, ref) {
  const { children, style, textStyle, ...rest } = props
  const linkProps = useNativeLinkProps(rest)

  const resolvedStyle = React.useMemo(() => {
    return [
      styles.link,
      style,
      linkProps.isActive ? linkProps.activeProps?.style : linkProps.inactiveProps?.style,
    ]
  }, [style, linkProps.isActive, linkProps.activeProps?.style, linkProps.inactiveProps?.style])

  const resolvedTextStyle = React.useMemo(() => {
    return [
      textStyle,
      linkProps.isActive ? linkProps.activeProps?.textStyle : linkProps.inactiveProps?.textStyle,
    ]
  }, [textStyle, linkProps.isActive, linkProps.activeProps?.textStyle, linkProps.inactiveProps?.textStyle])

  const renderChildren = () => {
    if (typeof children === 'function') {
      return children({
        isActive: linkProps.isActive,
        isTransitioning: linkProps.isTransitioning,
      })
    }

    if (typeof children === 'string') {
      return <Text style={resolvedTextStyle}>{children}</Text>
    }

    return children
  }

  return (
    <Pressable
      ref={ref}
      {...linkProps.pressableProps}
      onPress={linkProps.onPress}
      disabled={linkProps.disabled}
      style={resolvedStyle}
      accessibilityRole="link"
    >
      {renderChildren()}
    </Pressable>
  )
}) as <
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TTo extends string | undefined = undefined,
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '',
>(
  props: NativeLinkProps<TRouter, TFrom, TTo, TMaskFrom, TMaskTo> & {
    ref?: React.Ref<React.ElementRef<typeof Pressable>>
  },
) => React.ReactElement

const styles = StyleSheet.create({
  link: {
    // Default link styling (minimal)
  },
})
