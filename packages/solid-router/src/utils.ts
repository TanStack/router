import * as Solid from 'solid-js'

/**
 * React hook to wrap `IntersectionObserver`.
 *
 * This hook will create an `IntersectionObserver` and observe the ref passed to it.
 *
 * When the intersection changes, the callback will be called with the `IntersectionObserverEntry`.
 *
 * @param ref - The ref to observe
 * @param callback - The callback to call when the intersection changes
 * @param disabled - Whether observation is disabled
 * @param cleanupWhenDisabled - Whether cleanup is needed without an observer (defaults to true)
 * @returns The IntersectionObserver instance
 * @example
 * ```tsx
 * const MyComponent = () => {
 * const ref = React.useRef<HTMLDivElement>(null)
 * useIntersectionObserver(
 *  ref,
 *  (entry) => { doSomething(entry) },
 *  false
 * )
 * return <div ref={ref} />
 * ```
 */
export function useIntersectionObserver<T extends Element>(
  ref: Solid.Accessor<T | null>,
  callback: (entry?: IntersectionObserverEntry) => void,
  disabled: Solid.Accessor<boolean>,
  cleanupWhenDisabled?: Solid.Accessor<boolean>,
): Solid.Accessor<IntersectionObserver | null> {
  const isIntersectionObserverAvailable =
    typeof IntersectionObserver === 'function'
  let observerRef: IntersectionObserver | null = null

  Solid.createEffect(() => {
    const r = ref()
    if (disabled() || !r || !isIntersectionObserverAvailable) {
      if (cleanupWhenDisabled?.() ?? true) {
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

    observerRef = observer
    observer.observe(r)

    Solid.onCleanup(() => {
      active = false
      observer.disconnect()
      callback()
    })
  })

  return () => observerRef
}
