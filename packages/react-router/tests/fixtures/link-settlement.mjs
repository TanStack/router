import * as core from '@tanstack/router-core'
import { createMemoryHistory } from '@tanstack/history'

const mode = process.env.LINK_SETTLEMENT_CASE
const loaderStarted = core.createControlledPromise()
const loaderGate = core.createControlledPromise()
/** @type {Array<string>} */
const unhandled = []
process.on('unhandledRejection', (error) => {
  unhandled.push(error instanceof Error ? error.message : String(error))
})

const root = standaloneRoute(
  new core.BaseRootRoute({
    validateSearch: (search) => ({ marker: String(search.marker || '') }),
  }),
)
const home = standaloneRoute(
  new core.BaseRoute({
    getParentRoute: () => root,
    path: '/home',
    onLeave: () => {
      if (mode === 'transaction-error' || mode === 'both-errors') {
        throw new Error('transaction failed')
      }
    },
  }),
)
const away = standaloneRoute(
  new core.BaseRoute({
    getParentRoute: () => root,
    path: '/away',
    loader: () => {
      if (mode === 'registry-replacement') {
        loaderStarted.resolve(undefined)
        return loaderGate
      }
      return undefined
    },
  }),
)
const target = standaloneRoute(
  new core.BaseRoute({
    getParentRoute: () => root,
    path: '/target',
  }),
)
const history = createMemoryHistory({ initialEntries: ['/home?marker=before'] })
const router = new core.RouterCore(
  {
    routeTree: root.addChildren([home, away, target]),
    history,
    isServer: false,
    origin: 'http://localhost',
  },
  () => ({
    createMutableStore: core.createNonReactiveMutableStore,
    createReadonlyStore: core.createNonReactiveReadonlyStore,
    batch: (fn) => fn(),
  }),
)
await router.load()
/** @type {Promise<void> | undefined} */
let successor
let originalDerivations = 0
/** @type {core.LinkStateOptions} */
const options = {
  to: '/target',
  search: (/** @type {Record<string, unknown>} */ search) => {
    originalDerivations++
    if (mode === 'prepare-reentry' && search.marker === 'after') {
      history.push('/home?marker=successor')
      successor = router.load()
    }
    return search
  },
}
// Inputs and subscription now share one immutable descriptor. Keep the same
// navigation/error scenarios, including observers that never read a snapshot.
const record = core.createLinkStore(router, options, home.id)
const read = record[9 /* getSnapshot */]
read()
/** @type {core.LinkStore | undefined} */
let sibling
/** @type {string | undefined} */
let atomicHref
let siblingNotifications = 0
/** @type {(() => void) | undefined} */
let unsubscribeSibling
let notifications = 0
const unsubscribe = record[8 /* subscribe */](() => {
  notifications++
  if (mode === 'atomic-settlement') {
    atomicHref = sibling?.[9 /* getSnapshot */]()[0]
  }
  if (mode === 'reentry' && notifications === 1) {
    history.push('/home?marker=successor')
    successor = router.load()
  }
  if (mode === 'subscriber-error' || mode === 'both-errors') {
    throw new Error('subscriber failed')
  }
})
if (mode === 'atomic-settlement') {
  sibling = core.createLinkStore(
    router,
    { to: '/target', search: true },
    home.id,
  )
  sibling[9 /* getSnapshot */]()
  unsubscribeSibling = sibling[8 /* subscribe */](() => {
    siblingNotifications++
  })
}
let unsubscribePersistent
if (mode === 'publication-error') {
  const persistent = core.createLinkStore(router, options, root.id)
  unsubscribePersistent = persistent[8 /* subscribe */](() => {
    throw new Error('publication failed')
  })
}
/** @type {core.LinkStore | undefined} */
let replacement
/** @type {(() => void) | undefined} */
let unsubscribeReplacement
let replacementNotifications = 0
let derivationsAtDisposal = 0
/** @type {string | undefined} */
let hrefAtSettlement
let notificationsAtSettlement = 0
history.push('/away?marker=after')
let navigationError
try {
  const navigation = router.load()
  if (mode === 'registry-replacement') {
    await loaderStarted
    unsubscribe()
    derivationsAtDisposal = originalDerivations
    replacement = core.createLinkStore(
      router,
      { to: '/target', search: true },
      root.id,
    )
    replacement[9 /* getSnapshot */]()
    unsubscribeReplacement = replacement[8 /* subscribe */](() => {
      replacementNotifications++
    })
    loaderGate.resolve(undefined)
  }
  await navigation
} catch (error) {
  navigationError = error instanceof Error ? error.message : String(error)
}
await successor
await new Promise(setImmediate)
if (replacement) {
  hrefAtSettlement = replacement[9 /* getSnapshot */]()[0]
  notificationsAtSettlement = replacementNotifications
  history.push('/away?marker=latest')
  await router.load()
  await new Promise(setImmediate)
}
console.log(
  JSON.stringify({
    href: replacement ? replacement[9 /* getSnapshot */]()[0] : read()[0],
    notifications,
    navigationError: navigationError ?? null,
    unhandled,
    ...(mode === 'atomic-settlement' && {
      atomicHref,
      siblingNotifications,
    }),
    ...(replacement && {
      hrefAtSettlement,
      notificationsAtSettlement,
      replacementNotifications,
      derivationsAfterDisposal: originalDerivations - derivationsAtDisposal,
    }),
  }),
)
unsubscribe()
unsubscribePersistent?.()
unsubscribeSibling?.()
unsubscribeReplacement?.()
history.destroy()

// This child imports core only. The surrounding React test project augments
// AnyRoute with framework hooks that these standalone routes do not need.
/**
 * @param {unknown} route
 * @returns {core.AnyRoute}
 */
function standaloneRoute(route) {
  return /** @type {core.AnyRoute} */ (route)
}
