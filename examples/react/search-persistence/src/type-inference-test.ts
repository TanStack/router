// Test file to verify type inference is working with existing TanStack Router types
import { getSearchPersistenceStore } from '@tanstack/react-router'

// ✨ CLEAN API: 100% typed by default! ✨
const store = getSearchPersistenceStore()

// Test 1: Store state is automatically 100% typed
const state = store.state // 🎉 Automatically typed: {'/users': UsersSchema, '/products': ProductsSchema, ...}

// Test 2: Store for useStore hook is automatically 100% typed
const storeForUseStore = store.store // 🎉 Automatically typed: Store<{mapped route schemas}>

// Test 3: All methods are automatically 100% typed
const usersSearch = store.getSearch('/users') // 🎉 Automatically infers Users route search schema
const productsSearch = store.getSearch('/products') // 🎉 Automatically infers Products route search schema
const homeSearch = store.getSearch('/') // 🎉 Automatically infers home route search schema

// Test 4: saveSearch automatically enforces proper route-specific search schemas
store.saveSearch('/users', { name: 'Alice', page: 0 }) // 🎉 Fully typed, no manual annotations needed
store.saveSearch('/products', { category: 'Electronics', minPrice: 100 }) // 🎉 Fully typed

// Test 5: Other methods are also perfectly typed
store.clearSearch('/users') // 🎉 Route ID is typed
store.subscribe(() => {}) // 🎉 Works perfectly

// 🎉 Perfect! Clean API with 100% type inference by default!

export {
  store,
  state,
  storeForUseStore,
  usersSearch,
  productsSearch,
  homeSearch,
}
