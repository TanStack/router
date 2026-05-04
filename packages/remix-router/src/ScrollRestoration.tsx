/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import {
  getElementScrollRestorationEntry,
  setupScrollRestoration,
} from '@tanstack/router-core'
import { useRouter } from './useRouter'
import type { Handle } from '@remix-run/ui'
import type {
  ParsedLocation,
  ScrollRestorationEntry,
  ScrollRestorationOptions,
} from '@tanstack/router-core'

function setupOnce(handle: Handle<any, any>) {
  const router = useRouter(handle)
  setupScrollRestoration(router, true)
}

/**
 * @deprecated Use the `scrollRestoration` router option instead.
 *
 * Component shim that triggers scroll-restoration setup. Mirrors the React
 * binding's deprecated `<ScrollRestoration>`.
 */
export function ScrollRestoration(handle: Handle<ScrollRestorationOptions>) {
  setupOnce(handle)
  if (process.env.NODE_ENV === 'development') {
    console.warn(
      'The <ScrollRestoration> component is deprecated. Use createRouter\'s `scrollRestoration` option instead.',
    )
  }
  return () => null
}

/**
 * Returns the scroll-restoration entry for an element keyed by id or
 * `getElement`. Pair with `setupScrollRestoration` (run by the option).
 */
export function useElementScrollRestoration(
  handle: Handle<any, any>,
  options: (
    | { id: string; getElement?: () => Window | Element | undefined | null }
    | { id?: string; getElement: () => Window | Element | undefined | null }
  ) & {
    getKey?: (location: ParsedLocation) => string
  },
): ScrollRestorationEntry | undefined {
  setupOnce(handle)
  return getElementScrollRestorationEntry(useRouter(handle), options)
}
