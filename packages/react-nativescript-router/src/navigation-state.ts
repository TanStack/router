import type { NativeScriptNavigationTransition } from './route-options'

export interface NativeScriptNavigationOptions {
  animated?: boolean
  transition?: NativeScriptNavigationTransition
}

export interface NativeScriptNavigationState {
  __nsNavigation?: NativeScriptNavigationOptions
}

export function createNativeScriptNavigationState(
  options: NativeScriptNavigationOptions,
): NativeScriptNavigationState {
  return { __nsNavigation: options }
}

export function createNativeScriptTransitionState(
  transition: NativeScriptNavigationTransition,
): NativeScriptNavigationState {
  return createNativeScriptNavigationState({ transition })
}

export function getNativeScriptNavigationOptions(
  state: unknown,
): NativeScriptNavigationOptions | undefined {
  if (!state || typeof state !== 'object') {
    return undefined
  }

  return (state as NativeScriptNavigationState).__nsNavigation
}
