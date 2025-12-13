export function getHydrateStatus(
  matches: Array<any>,
  router: any,
): {
  shouldHydrate: boolean
  hasConflict: boolean
} {
  let hasExplicitFalse = false
  let hasExplicitTrue = false
  const defaultHydrate = router.options.defaultHydrate ?? true

  matches.forEach((match) => {
    const route = router.looseRoutesById[match.routeId]
    const hydrateOption = route?.options.hydrate ?? defaultHydrate

    if (hydrateOption === false) {
      hasExplicitFalse = true
    } else if (hydrateOption === true && route?.options.hydrate !== undefined) {
      // Only count as explicit true if it was actually set on the route
      hasExplicitTrue = true
    }
  })

  const hasConflict = hasExplicitFalse && hasExplicitTrue

  // If any route has false, don't hydrate (even if there's a conflict)
  const shouldHydrate = !hasExplicitFalse

  return { shouldHydrate, hasConflict }
}
