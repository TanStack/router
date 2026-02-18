import type { AnyRouter } from '@tanstack/router-core'

export function getHydrateStatus(
  matches: ReadonlyArray<{ routeId: string }>,
  router: AnyRouter,
): {
  shouldHydrate: boolean
  hasConflict: boolean
} {
  let hasExplicitFalse = false
  let hasExplicitTrue = false

  const defaultHydrateOption = (router.options as { defaultHydrate?: unknown })
    .defaultHydrate
  const defaultHydrate =
    typeof defaultHydrateOption === 'boolean' ? defaultHydrateOption : true

  matches.forEach((match) => {
    const route = router.looseRoutesById[match.routeId] as
      | {
          options?: {
            hydrate?: boolean
          }
        }
      | undefined

    const routeHydrate = route?.options?.hydrate
    const hydrateOption = routeHydrate ?? defaultHydrate

    if (hydrateOption === false) {
      hasExplicitFalse = true
    } else if (hydrateOption === true && routeHydrate !== undefined) {
      hasExplicitTrue = true
    }
  })

  const hasConflict = hasExplicitFalse && hasExplicitTrue
  const shouldHydrate = !hasExplicitFalse

  return { shouldHydrate, hasConflict }
}
