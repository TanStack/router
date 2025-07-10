import {
  defaultGetScrollRestorationKey,
  getCssSelector,
  scrollRestorationCache,
  setupScrollRestoration,
} from '@tanstack/router-core'
import { useRouter } from './useRouter'
import type {
  ParsedLocation,
  ScrollRestorationEntry,
  ScrollRestorationOptions,
} from '@tanstack/router-core'

function useScrollRestoration() {
  const router = useRouter()
  setupScrollRestoration(router, true)
}

/**
 * @deprecated use createRouter's `scrollRestoration` option instead
 */
export function ScrollRestoration(_props: ScrollRestorationOptions) {
  useScrollRestoration()

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
        getElement?: () => Window | Element | undefined | null
      }
    | {
        id?: string
        getElement: () => Window | Element | undefined | null
      }
  ) & {
    getKey?: (location: ParsedLocation) => string
  },
): ScrollRestorationEntry | undefined {
  useScrollRestoration()

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
    elementSelector =
      element instanceof Window ? 'window' : getCssSelector(element)
  }

  const restoreKey = getKey(router.latestLocation)
  const byKey = scrollRestorationCache?.state[restoreKey]
  return byKey?.[elementSelector]
}
