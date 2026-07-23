import '@tanstack/solid-start/server-only'

export const serverOnlyPrerenderMarker =
  'server-only-prerender-marker-should-not-be-in-client'

export function getServerOnlyPrerenderSlug() {
  return serverOnlyPrerenderMarker.replace(
    'server-only-prerender-marker-should-not-be-in-client',
    'server-only-slug',
  )
}
