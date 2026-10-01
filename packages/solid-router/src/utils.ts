import * as Solid from 'solid-js'

export function useIntersectionObserver<T extends Element>(
  ref: Solid.Accessor<T | null>,
  callback: (entry?: IntersectionObserverEntry) => void,
  preload: Solid.Accessor<false | 'intent' | 'viewport' | 'render' | undefined>,
): void {
  const isIntersectionObserverAvailable =
    typeof IntersectionObserver === 'function'

  Solid.createEffect(() => {
    const r = ref()
    const mode = preload()
    if (mode !== 'viewport' || !r || !isIntersectionObserverAvailable) {
      if (mode) {
        Solid.onCleanup(() => callback())
      }
      return
    }

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

    Solid.onCleanup(() => {
      active = false
      observer.disconnect()
      callback()
    })
  })
}
