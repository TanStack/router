import * as core from '@tanstack/router-core'
import { createMemoryHistory } from '@tanstack/history'

const mode = process.env.LINK_SETTLEMENT_CASE
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
  new core.BaseRoute({ getParentRoute: () => root, path: '/away' }),
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
/** @type {core.LinkStateOptions} */
const options = {
  to: '/target',
  search: (/** @type {Record<string, unknown>} */ search) => {
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
let notifications = 0
const unsubscribe = record.subscribe(() => {
  notifications++
  if (mode === 'reentry' && notifications === 1) {
    history.push('/home?marker=successor')
    successor = router.load()
  }
  if (mode === 'subscriber-error' || mode === 'both-errors') {
    throw new Error('subscriber failed')
  }
})
let unsubscribePersistent
if (mode === 'publication-error') {
  const persistent = core.createLinkStore(router)
  const persistentView = createView(persistent, options, root.id)
  persistentView.commit()
  unsubscribePersistent = persistent.subscribe(() => {
    throw new Error('publication failed')
  })
}
history.push('/away?marker=after')
let navigationError
try {
  await router.load()
} catch (error) {
  navigationError = error instanceof Error ? error.message : String(error)
}
await successor
await new Promise(setImmediate)
console.log(
  JSON.stringify({
    href: read()[0],
    notifications,
    navigationError: navigationError ?? null,
    unhandled,
  }),
)
unsubscribe()
unsubscribePersistent?.()
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
