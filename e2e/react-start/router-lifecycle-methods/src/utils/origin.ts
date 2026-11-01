import { createIsomorphicFn } from '@tanstack/react-start'

/** Which bundle ran the calling lifecycle: 'server' during SSR, 'client' in the browser. */
export const getOrigin = createIsomorphicFn()
  .server(() => 'server')
  .client(() => 'client')

/**
 * Per-page client-side run counter kept on `globalThis` so tests can read it
 * both from the DOM (when a lifecycle puts it in its result) and through
 * `page.evaluate`. The server branch returns 0 so a transported value can be
 * told apart from a client re-run by the count alone.
 */
export const countClientRun = createIsomorphicFn()
  .server((_key: string) => 0)
  .client((key: string) => {
    const counters = ((globalThis as any).__tsrE2eRuns ??= {}) as Record<
      string,
      number
    >
    counters[key] = (counters[key] ?? 0) + 1
    return counters[key]
  })
