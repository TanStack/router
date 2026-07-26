// `@tanstack/history` is a separate framework-agnostic dependency (the browser/
// hash/memory history abstractions). react-router re-exports it from `./history`;
// we mirror that so `@tanstack/octane-router/history` and the bare entry both resolve it.
export {
  createHistory,
  createBrowserHistory,
  createHashHistory,
  createMemoryHistory,
} from '@tanstack/history'
export type * from '@tanstack/history'
