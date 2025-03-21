import * as Vue from 'vue'

// Create symbols for injection keys
export const MatchSymbol = Symbol('TanStackRouterMatch')
export const DummyMatchSymbol = Symbol('TanStackRouterDummyMatch')

/**
 * Provides a match ID to child components
 */
export function provideMatch(matchId: string | undefined) {
  Vue.provide(MatchSymbol, Vue.ref(matchId))
}

/**
 * Retrieves the match ID from the component tree
 */
export function injectMatch(): Vue.Ref<string | undefined> {
  return Vue.inject(MatchSymbol, Vue.ref(undefined))
}

/**
 * Provides a dummy match ID to child components
 */
export function provideDummyMatch(matchId: string | undefined) {
  Vue.provide(DummyMatchSymbol, Vue.ref(matchId))
}

/**
 * Retrieves the dummy match ID from the component tree
 * This only exists so we can conditionally inject a value when we are not interested in the nearest match
 */
export function injectDummyMatch(): Vue.Ref<string | undefined> {
  return Vue.inject(DummyMatchSymbol, Vue.ref(undefined))
}

// Create a typed injection key with support for undefined values
export const matchContext = Symbol('matchContext') as Vue.InjectionKey<Vue.Ref<string | undefined>>

export const dummyMatchContext = {
  provide: provideDummyMatch,
  inject: injectDummyMatch
}
