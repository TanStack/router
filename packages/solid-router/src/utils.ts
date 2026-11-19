import * as Solid from 'solid-js'

/**
 * Observe a Link's element while it preloads on `'viewport'`: `callback`
 * receives each intersection entry. Whenever the element or preload mode
 * changes, and on cleanup, a preloading Link gets `callback()` so it can
 * cancel a pending preload.
 */
export function useIntersectionObserver<T extends Element>(
  ref: Solid.Accessor<T | null>,
  callback: (entry?: IntersectionObserverEntry) => void,
  preload: Solid.Accessor<unknown>,
): void {
  Solid.createEffect(
    () => [ref(), preload()] as const,
    ([r, mode]) => {
      if (
        mode === 'viewport' &&
        r &&
        typeof IntersectionObserver === 'function'
      ) {
        let active = true
        const observer = new IntersectionObserver(
          (entries) => {
            // Queued notifications can arrive after this effect has cleaned up.
            if (active) {
              callback(entries.pop())
            }
          },
          { rootMargin: '100px' },
        )
        observer.observe(r)
        return () => {
          active = false
          observer.disconnect()
          callback()
        }
      }
      if (mode) {
        // Intent preloading still needs timer cleanup without an observer.
        return () => callback()
      }
      return undefined
    },
  )
}
