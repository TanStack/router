export const waitForMacrotask = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })

export function findMatch<TMatch extends { routeId: string }>(
  router: { state: { matches: ReadonlyArray<TMatch> } },
  routeId: string,
) {
  return router.state.matches.find((match) => match.routeId === routeId)
}
