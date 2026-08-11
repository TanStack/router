import * as Solid from 'solid-js'

/**
 * React hook to wrap `IntersectionObserver`.
 *
 * This hook will create an `IntersectionObserver` and observe the ref passed to it.
 *
 * When the intersection changes, the callback will be called with the `IntersectionObserverEntry`.
 *
 * @param ref - The ref to observe
 * @param intersectionObserverOptions - The options to pass to the IntersectionObserver
 * @param disabled - Whether observation is disabled
 * @param callback - The callback to call when the intersection changes
 * @returns The IntersectionObserver instance
 * @example
 * ```tsx
 * const MyComponent = () => {
 * const ref = React.useRef<HTMLDivElement>(null)
 * useIntersectionObserver(
 *  ref,
 *  (entry) => { doSomething(entry) },
 *  { rootMargin: '10px' },
 *  false
 * )
 * return <div ref={ref} />
 * ```
 */
export function useIntersectionObserver<T extends Element>(
  ref: Solid.Accessor<T | null>,
  callback: (entry: IntersectionObserverEntry | undefined) => void,
  intersectionObserverOptions: IntersectionObserverInit = {},
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

    observerRef = new IntersectionObserver((entries) => {
      callback(entries.pop())
    }, intersectionObserverOptions)

    observerRef.observe(r)

    Solid.onCleanup(() => {
      observerRef?.disconnect()
    })
  })

  return () => observerRef
}
