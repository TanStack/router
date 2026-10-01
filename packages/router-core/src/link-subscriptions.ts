import { removeTrailingSlash } from './path'
import type { ParsedLocation } from './location'
import type { AnyRouter } from './router'

/** Private publication for Links rendered by one owner; never a reactive store. */
export type LinkScope = [
  location: ParsedLocation,
  subscriptions?: Set<LinkSubscription>,
]

/** Metadata only. The adapter owns destination computation and cached output. */
export type LinkSubscription = [
  scope: LinkScope,
  notify: () => void,
  dynamic?: boolean,
  pathname?: string,
  exact?: boolean,
  activity?: number,
]

export function _getLinkScope(
  router: AnyRouter,
  owner?: string,
  source?: ParsedLocation,
): LinkScope {
  const scope = router._linkScopes?.get(owner)
  if (scope) {
    return scope
  }
  // Cold/speculative reads do not acquire a router registration. A newly
  // rendered Link in outgoing content must also observe the frozen source.
  const departing =
    owner &&
    router._tx &&
    // Commit transfers lane ownership before the framework mounts incoming
    // Links; redirects retain their semantic lane until the successor takes over.
    !(router._tx[3].length ? router._tx[3] : router._committed).some(
      (match) => match.routeId === owner,
    )
  return [
    (departing && (source || router.stores.resolvedLocation.get())) ||
      router.stores.location.get(),
  ]
}

export function _subscribeLink(
  router: AnyRouter,
  owner: string | undefined,
  subscription: LinkSubscription,
): () => void {
  const scopes = (router._linkScopes ??= new Map())
  let scope = scopes.get(owner)
  if (!scope) {
    // A retargeted binding can commit after the last old subscription cleans
    // up. Preserve its actual frozen source, which may be newer than resolved.
    scope = _getLinkScope(
      router,
      owner,
      subscription[0 /* scope */][0 /* location */],
    )
    scopes.set(owner, scope)
  }
  subscription[0 /* scope */] = scope
  // Cold React input versions allocate no collection; only committed owners do.
  const subscriptions = (scope[1 /* subscriptions */] ??= new Set())
  subscriptions.add(subscription)
  return () => {
    subscriptions.delete(subscription)
    if (!subscriptions.size && scopes.get(owner) === scope) {
      scopes.delete(owner)
    }
  }
}

export function _matchesLinkPath(
  current: string,
  target: string,
  exact?: boolean,
): boolean {
  return exact
    ? current === target
    : current.startsWith(target) &&
        (current.length === target.length || current[target.length] === '/')
}

/** Publish every advancing owner before notifying any of its consumers. */
export function _publishLinks(
  router: AnyRouter,
  settled = false,
  force = false,
): void {
  if (!router._linkScopes?.size) {
    return
  }
  const location = router.stores.location.get()
  const tx = router._tx
  const preflight = router._preflight
  const config = router._linkConfig
  const publications: Array<[LinkScope, ParsedLocation]> = []
  for (const [owner, scope] of router._linkScopes) {
    const advance =
      settled ||
      !owner ||
      !tx ||
      (tx[3].length ? tx[3] : router._committed).some(
        (match) => match.routeId === owner,
      )
    const previous = scope[0 /* location */]
    if (advance) {
      scope[0 /* location */] = location
    }
    if (previous !== scope[0 /* location */] || force) {
      publications.push([scope, previous])
    }
  }
  // Built-in path formatters are independent of the moving browser URL.
  // Unknown/custom formatters (including hash history) invalidate conservatively.
  const format = router.history.createHref !== router.history._hrefIndependent
  for (const [scope, previous] of publications) {
    const next = scope[0 /* location */]
    const changed =
      (previous.pathname !== next.pathname ? 1 : 0) |
      (previous.search !== next.search ? 2 : 0) |
      (previous.hash !== next.hash ? 4 : 0)
    const oldPath = removeTrailingSlash(previous.pathname, router.basepath)
    const newPath = removeTrailingSlash(next.pathname, router.basepath)
    for (const subscription of scope[1 /* subscriptions */]!) {
      // A notification can navigate or replace configuration. The existing
      // publication authority stops obsolete dispatch before another callback.
      if (
        router._tx !== tx ||
        router._preflight !== preflight ||
        router.stores.location.get() !== location ||
        router._linkConfig !== config
      ) {
        return
      }
      if (
        force ||
        (previous !== next && subscription[2 /* dynamic */]) ||
        (subscription[3 /* pathname */] !== undefined &&
          (format ||
            (changed & subscription[5 /* activity */]! &&
              (_matchesLinkPath(
                oldPath,
                subscription[3 /* pathname */],
                subscription[4 /* exact */],
              ) ||
                _matchesLinkPath(
                  newPath,
                  subscription[3 /* pathname */],
                  subscription[4 /* exact */],
                )))))
      ) {
        subscription[1 /* notify */]()
      }
    }
  }
}
