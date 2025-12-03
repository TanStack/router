import * as Vue from 'vue'

// Create a typed injection key with support for undefined values
// This is the primary match context used throughout the router
export const matchContext = Symbol('TanStackRouterMatch') as Vue.InjectionKey<
  Vue.Ref<string | undefined>
>

// Dummy match context for when we want to look up by explicit 'from' route
export const dummyMatchContext = Symbol(
  'TanStackRouterDummyMatch',
) as Vue.InjectionKey<Vue.Ref<string | undefined>>

/**
 * Provides a match ID to child components
 */
export function provideMatch(matchId: string | undefined) {
  Vue.provide(matchContext, Vue.ref(matchId))
}

/**
 * Retrieves the match ID from the component tree
 */
export function injectMatch(): Vue.Ref<string | undefined> {
  return Vue.inject(matchContext, Vue.ref(undefined))
}

/**
 * Provides a dummy match ID to child components
 */
export function provideDummyMatch(matchId: string | undefined) {
  Vue.provide(dummyMatchContext, Vue.ref(matchId))
}

/**
 * Retrieves the dummy match ID from the component tree
 * This only exists so we can conditionally inject a value when we are not interested in the nearest match
 */
export function injectDummyMatch(): Vue.Ref<string | undefined> {
  return Vue.inject(dummyMatchContext, Vue.ref(undefined))
}
