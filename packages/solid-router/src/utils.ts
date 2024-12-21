import * as React from 'react'
import type { RouteIds } from './routeInfo'
import type { AnyRouter } from './router'
import type { ConstrainLiteral } from './common/utils'

export type StrictOrFrom<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean = true,
> = TStrict extends false
  ? {
      from?: never
      strict: TStrict
    }
  : {
      from: ConstrainLiteral<TFrom, RouteIds<TRouter['routeTree']>>
      strict?: TStrict
    }

export const useLayoutEffect =
  typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect

/**
 * React hook to wrap `IntersectionObserver`.
 *
 * This hook will create an `IntersectionObserver` and observe the ref passed to it.
 *
 * When the intersection changes, the callback will be called with the `IntersectionObserverEntry`.
 *
 * @param ref - The ref to observe
 * @param intersectionObserverOptions - The options to pass to the IntersectionObserver
 * @param options - The options to pass to the hook
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
 *  { disabled: false }
 * )
 * return <div ref={ref} />
 * ```
 */
export function useIntersectionObserver<T extends Element>(
  ref: React.RefObject<T>,
  callback: (entry: IntersectionObserverEntry | undefined) => void,
  intersectionObserverOptions: IntersectionObserverInit = {},
  options: { disabled?: boolean } = {},
): IntersectionObserver | null {
  const isIntersectionObserverAvailable = React.useRef(
    typeof IntersectionObserver === 'function',
  )

  const observerRef = React.useRef<IntersectionObserver | null>(null)

  React.useEffect(() => {
    if (
      !ref.current ||
      !isIntersectionObserverAvailable.current ||
      options.disabled
    ) {
      return
    }

    observerRef.current = new IntersectionObserver(([entry]) => {
      callback(entry)
    }, intersectionObserverOptions)

    observerRef.current.observe(ref.current)

    return () => {
      observerRef.current?.disconnect()
    }
  }, [callback, intersectionObserverOptions, options.disabled, ref])

  return observerRef.current
}

/**
 * React hook to take a `React.ForwardedRef` and returns a `ref` that can be used on a DOM element.
 *
 * @param ref - The forwarded ref
 * @returns The inner ref returned by `useRef`
 * @example
 * ```tsx
 * const MyComponent = React.forwardRef((props, ref) => {
 *  const innerRef = useForwardedRef(ref)
 *  return <div ref={innerRef} />
 * })
 * ```
 */
export function useForwardedRef<T>(ref?: React.ForwardedRef<T>) {
  const innerRef = React.useRef<T>(null)

  React.useEffect(() => {
    if (!ref) return
    if (typeof ref === 'function') {
      ref(innerRef.current)
    } else {
      ref.current = innerRef.current
    }
  })

  return innerRef
}