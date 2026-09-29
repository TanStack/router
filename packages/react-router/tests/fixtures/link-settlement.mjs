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
const record = core.createLinkStore(router)
// The PR experiments keep subscription identity while moving view operations
// from methods to exports. Exercise the same public adapter contract on both.
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
const view = createView(record, options, home.id)
const read = view.read
read()
view.commit()
/** @type {ReturnType<typeof createView> | undefined} */
let sibling
/** @type {string | undefined} */
let atomicHref
let siblingNotifications = 0
/** @type {(() => void) | undefined} */
let unsubscribeSibling
let notifications = 0
const unsubscribe = record.subscribe(() => {
  notifications++
  if (mode === 'atomic-settlement') {
    atomicHref = sibling?.read()[0]
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
  const siblingStore = core.createLinkStore(router)
  sibling = createView(siblingStore, { to: '/target', search: true }, home.id)
  sibling.read()
  sibling.commit()
  unsubscribeSibling = siblingStore.subscribe(() => {
    siblingNotifications++
  })
}
let unsubscribePersistent
if (mode === 'publication-error') {
  const persistent = core.createLinkStore(router)
  const persistentView = createView(persistent, options, root.id)
  persistentView.commit()
  unsubscribePersistent = persistent.subscribe(() => {
    throw new Error('publication failed')
  })
}
/** @type {ReturnType<typeof createView> | undefined} */
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
    const replacementStore = core.createLinkStore(router)
    replacement = createView(
      replacementStore,
      { to: '/target', search: true },
      root.id,
    )
    replacement.read()
    replacement.commit()
    unsubscribeReplacement = replacementStore.subscribe(() => {
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
  hrefAtSettlement = replacement.read()[0]
  notificationsAtSettlement = replacementNotifications
  history.push('/away?marker=latest')
  await router.load()
  await new Promise(setImmediate)
}
console.log(
  JSON.stringify({
    href: replacement ? replacement.read()[0] : read()[0],
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

/**
 * @typedef {{getSnapshot: () => core.LinkState, commit: () => void}} LegacyLinkView
 * @typedef {{render: (options: core.LinkStateOptions, owner: string) => LegacyLinkView}} LegacyLinkStore
 */

/**
 * Keep the same fixture usable with both public custom-adapter APIs. The cast
 * is confined to the legacy branch, whose methods moved to exports in the
 * candidate. Both branches perform the same reads and commits at the call site.
 * @param {ReturnType<typeof core.createLinkStore>} record
 * @param {core.LinkStateOptions} options
 * @param {string} owner
 */
function createView(record, options, owner) {
  if (core.renderLinkView) {
    const view = core.renderLinkView(record, options, owner)
    return {
      read: () => core.readLinkSnapshot(view),
      commit: () => core.commitLinkView(view),
    }
  }
  const legacy = /** @type {LegacyLinkStore} */ (
    /** @type {unknown} */ (record)
  )
  const view = legacy.render(options, owner)
  return {
    read: () => view.getSnapshot(),
    commit: () => view.commit(),
  }
}
