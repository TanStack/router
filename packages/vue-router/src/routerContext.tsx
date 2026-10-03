import * as Vue from 'vue'
import type { AnyRouter, RouterPresentationSource } from '@tanstack/router-core'

export const routerContext = Symbol(
  'TanStackRouter',
) as Vue.InjectionKey<RouterPresentationSource>

/**
 * Provides the router to all child components
 */
export function provideRouter(router: AnyRouter): void {
  Vue.provide(routerContext, router.stores.locationSource)
}

/**
 * Injects the router from the component tree
 */
export function injectRouter(): AnyRouter {
  const source = Vue.inject(routerContext, null)
  if (!source) {
    throw new Error(
      'No TanStack Router found in component tree. Did you forget to add a RouterProvider component?',
    )
  }
  return source[0]
}
