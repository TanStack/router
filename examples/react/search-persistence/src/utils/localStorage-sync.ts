import { getSearchPersistenceStore } from '@tanstack/react-router'

const STORAGE_KEY = 'search-persistence'

export function setupLocalStorageSync() {
  const store = getSearchPersistenceStore()

  // Restore from localStorage on initialization
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) {
    try {
      const parsedState = JSON.parse(stored)
      Object.entries(parsedState).forEach(([routeId, search]) => {
        store.saveSearch(routeId as any, search as Record<string, unknown>)
      })
    } catch (error) {
      console.warn(
        'Failed to restore search persistence from localStorage:',
        error,
      )
    }
  }

  // Subscribe to changes and sync to localStorage
  return store.subscribe(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store.state))
    } catch (error) {
      console.warn('Failed to sync search persistence to localStorage:', error)
    }
  })
}
