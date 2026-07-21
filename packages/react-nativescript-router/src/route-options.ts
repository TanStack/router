import type { NavigationTransition } from '@nativescript/core'
import type {
  NativeAnimation,
  NativeGetIdContext,
  NativeHeaderStyle,
  NativeRouteContext,
  NativeRouteOptions,
  NativeRouteOptionsInput,
} from '@tanstack/react-router/native'

export type NativeScriptNavigationTransition = NavigationTransition

declare module '@tanstack/react-router/native' {
  interface NativeHeaderStyleExtensions {
    color?: string
    flat?: boolean
  }

  interface NativeRouteOptionsExtensions {
    animated?: boolean
    transition?: NativeScriptNavigationTransition
  }
}

export type NativeScriptRouteContext = NativeRouteContext
export type NativeScriptHeaderStyle = NativeHeaderStyle
export type NativeScriptGetIdContext = NativeGetIdContext
export type NativeScriptRouteOptions = NativeRouteOptions
export type NativeScriptRouteOptionsInput = NativeRouteOptionsInput
export type { NativeAnimation }

export function resolveNativeScriptTransition(
  options: NativeScriptRouteOptions,
): { animated?: boolean; transition?: NativeScriptNavigationTransition } {
  if (options.transition) {
    return {
      animated: options.animated,
      transition: options.transition,
    }
  }

  switch (options.animation) {
    case 'none':
      return { animated: false }
    case 'fade':
    case 'fade_from_bottom':
      return { animated: options.animated, transition: { name: 'fade' } }
    case 'flip':
      return { animated: options.animated, transition: { name: 'flipRight' } }
    case 'slide_from_left':
      return { animated: options.animated, transition: { name: 'slideRight' } }
    case 'slide_from_bottom':
      return { animated: options.animated, transition: { name: 'slideTop' } }
    case 'simple_push':
    case 'slide_from_right':
      return { animated: options.animated, transition: { name: 'slideLeft' } }
    default:
      return { animated: options.animated }
  }
}
