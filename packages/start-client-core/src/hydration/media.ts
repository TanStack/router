import type { HydrationPrefetchStrategy } from './types'

const mediaType = 'media'

function listenForMedia(query: string, callback: () => void) {
  if (!query) return

  const mediaQuery = window.matchMedia(query)
  const onChange = () => {
    if (mediaQuery.matches) callback()
  }
  mediaQuery.addEventListener('change', onChange)
  onChange()

  return () => mediaQuery.removeEventListener('change', onChange)
}

/* @__NO_SIDE_EFFECTS__ */
export function media(
  query: string,
): HydrationPrefetchStrategy<typeof mediaType> {
  return {
    _t: mediaType,
    _s: ({ gate, prefetch }) =>
      listenForMedia(query, prefetch ?? gate!.resolve),
  }
}
