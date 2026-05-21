import type { AnyRouter } from './router'

export interface HydrateStatus {
  shouldHydrate: boolean
  hasConflict: boolean
}

/**
 * Determines whether the matched route tree should hydrate on the client.
 *
 * Resolution rules:
 * - If any matched route explicitly sets `hydrate: false`, the page will not hydrate.
 * - Otherwise the page hydrates.
 * - `router.options.defaultHydrate` provides the default when a route has no explicit value (defaults to `true`).
 * - A conflict is reported when one matched route explicitly sets `hydrate: false`
 *   while another explicitly sets `hydrate: true`.
 */
export function getHydrateStatus(
  matches: ReadonlyArray<{ routeId: string }>,
  router: AnyRouter,
): HydrateStatus {
  const defaultHydrateOption = (router.options as { defaultHydrate?: unknown })
    .defaultHydrate
  const defaultHydrate =
    typeof defaultHydrateOption === 'boolean' ? defaultHydrateOption : true

  let hasExplicitFalse = false
  let hasExplicitTrue = false

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]!
    const route = router.looseRoutesById[match.routeId] as
      | { options?: { hydrate?: boolean } }
      | undefined

    const routeHydrate = route?.options?.hydrate
    const hydrateOption = routeHydrate ?? defaultHydrate

    if (hydrateOption === false) {
      hasExplicitFalse = true
    } else if (hydrateOption === true && routeHydrate !== undefined) {
      hasExplicitTrue = true
    }

    if (hasExplicitFalse && hasExplicitTrue) break
  }

  return {
    shouldHydrate: !hasExplicitFalse,
    hasConflict: hasExplicitFalse && hasExplicitTrue,
  }
}
