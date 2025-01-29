import { useRouter } from './useRouter'
import {
  defaultGetScrollRestorationKey,
  getCssSelector,
  scrollRestorationCache,
} from './scroll-restoration'
import type { ScrollRestorationOptions } from './scroll-restoration'
import type { ParsedLocation } from '@tanstack/router-core'

/**
 * @deprecated use createRouter's `scrollRestoration` option instead
 */
export function ScrollRestoration(_props: ScrollRestorationOptions) {
  if (process.env.NODE_ENV === 'development') {
    console.warn(
      "The ScrollRestoration component is deprecated. Use createRouter's `scrollRestoration` option instead.",
    )
  }
  return null
}

export function useElementScrollRestoration(
  options: (
    | {
        id: string
        getElement?: () => Element | undefined | null
      }
    | {
        id?: string
        getElement: () => Element | undefined | null
      }
  ) & {
    getKey?: (location: ParsedLocation) => string
  },
) {
  const router = useRouter()
  const getKey = options.getKey || defaultGetScrollRestorationKey

  let elementSelector = ''

  if (options.id) {
    elementSelector = `[data-scroll-restoration-id="${options.id}"]`
  } else {
    const element = options.getElement?.()
    if (!element) {
      return
    }
    elementSelector = getCssSelector(element)
  }

  const restoreKey = getKey(router.latestLocation)
  const byKey = scrollRestorationCache.state[restoreKey]
  return byKey?.[elementSelector]
}
