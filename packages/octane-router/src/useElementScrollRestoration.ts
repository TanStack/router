// useElementScrollRestoration — restore scroll for a specific element (e.g. a
// virtualized list) by id or getter. Port of react-router's
// ScrollRestoration.tsx helper: ensures the router's scroll restoration is set
// up, then reads the element's stored entry from the scroll-restoration cache.
import {
  getElementScrollRestorationEntry,
  setupScrollRestoration,
} from '@tanstack/router-core'
import { useRouter } from './context'
import type {
  ParsedLocation,
  ScrollRestorationEntry,
} from '@tanstack/router-core'

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
  const router = useRouter()
  setupScrollRestoration(router, true)
  return getElementScrollRestorationEntry(router, options)
}
