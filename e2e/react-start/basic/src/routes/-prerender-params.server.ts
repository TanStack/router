import '@tanstack/react-start/server-only'

export const SERVER_ONLY_PRERENDER_MARKER =
  'server-only-prerender-marker-should-not-be-in-client'

export function getServerOnlyPrerenderSlug() {
  return SERVER_ONLY_PRERENDER_MARKER.replace(
    'server-only-prerender-marker-should-not-be-in-client',
    'server-only-slug',
  )
}
