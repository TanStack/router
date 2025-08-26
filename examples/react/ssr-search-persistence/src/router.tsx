import {
  SearchPersistenceStore,
  createRouter as createReactRouter,
} from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { serverDatabase } from './lib/serverDatabase'

export function createRouter() {
  let searchPersistenceStore: SearchPersistenceStore | undefined

  if (typeof window !== 'undefined') {
    searchPersistenceStore = new SearchPersistenceStore()

    // Load initial data from server database into router store
    const allRecords = serverDatabase.getAllRecords()
    allRecords.forEach((record) => {
      searchPersistenceStore!.saveSearch(
        record.routeId as any,
        record.searchParams,
      )
    })

    // Subscribe to router store changes and save to server database
    searchPersistenceStore.subscribe(() => {
      if (!searchPersistenceStore) return
      const storeState = searchPersistenceStore.state

      // Save routes that have non-empty search params
      Object.entries(storeState).forEach(([routeId, searchParams]) => {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (Object.keys(searchParams || {}).length > 0) {
          serverDatabase.save(routeId, searchParams, 'demo-user')
        }
      })

      // Restore routes from database if they're missing from store
      const allDbRecords = serverDatabase.getAllRecords()
      const missingRoutes = allDbRecords.filter(
        (record) => !(record.routeId in storeState),
      )

      if (missingRoutes.length > 0) {
        missingRoutes.forEach((record) => {
          searchPersistenceStore!.saveSearch(
            record.routeId as any,
            record.searchParams,
          )
        })
      }
    })
  }

  return createReactRouter({
    routeTree,
    context: {
      head: '',
    },
    searchPersistenceStore,
    defaultPreload: 'intent',
    scrollRestoration: true,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>
  }
}
