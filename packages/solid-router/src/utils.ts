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
  callback: (entry: IntersectionObserverEntry | undefined) => void,
  disabled?: boolean,
): Solid.Accessor<IntersectionObserver | null> {
  const isIntersectionObserverAvailable =
    typeof IntersectionObserver === 'function'
  let observerRef: IntersectionObserver | null = null

  Solid.createEffect(() => {
    const r = ref()
    if (!r || !isIntersectionObserverAvailable || disabled) {
      return
    }

    observerRef = new IntersectionObserver(
      (entries) => {
        callback(entries.pop())
      },
      { rootMargin: '100px' },
    )

    observerRef.observe(r)

    Solid.onCleanup(() => {
      observerRef?.disconnect()
    })
  })

  return () => observerRef
}
