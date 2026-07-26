// Suspend until a deferred promise resolves and return its data. react-router uses
// `React.use(promise)` when available; octane has the same Suspense-shaped `use`, so
// this is a one-liner. The promise is typically produced by router-core's `defer()`
// in a loader and streamed to the client.
import { use } from 'octane'
import { toExternalHydrationThenable } from './externalHydration'

export type AwaitOptions<T> = {
  promise: Promise<T>
}

export function useAwaited<T>(opts: AwaitOptions<T>): T {
  return use(toExternalHydrationThenable(opts.promise))
}
