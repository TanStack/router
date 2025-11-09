import {
  useRef,
  useEffect,
  useLayoutEffect as preactUseLayoutEffect,
  useImperativeHandle,
} from 'preact/hooks'
import type { Ref } from 'preact'

export function useStableCallback<T extends (...args: Array<any>) => any>(
  fn: T,
): T {
  const fnRef = useRef(fn)
  fnRef.current = fn

  const ref = useRef((...args: Array<any>) => fnRef.current(...args))
  return ref.current as T
}

export const useLayoutEffect =
  typeof window !== 'undefined' ? preactUseLayoutEffect : useEffect

/**
 * Taken from https://www.developerway.com/posts/implementing-advanced-use-previous-hook#part3
 */
export function usePrevious<T>(value: T): T | null {
  // initialise the ref with previous and current values
  const ref = useRef<{ value: T; prev: T | null }>({
    value: value,
    prev: null,
  })

  const current = ref.current.value

  // if the value passed into hook doesn't match what we store as "current"
  // move the "current" to the "previous"
  // and store the passed value as "current"
  if (value !== current) {
    ref.current = {
      value: value,
      prev: current,
    }
  }

  // return the previous value only
  return ref.current.prev
}

/**
 * Preact hook to wrap `IntersectionObserver`.
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
 * const ref = useRef<HTMLDivElement>(null)
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
  ref: { current: T | null } | null,
  callback: (entry: IntersectionObserverEntry | undefined) => void,
  intersectionObserverOptions: IntersectionObserverInit = {},
  options: { disabled?: boolean } = {},
) {
  useEffect(() => {
    if (
      !ref ||
      !ref.current ||
      options.disabled ||
      typeof IntersectionObserver !== 'function'
    ) {
      return
    }

    const observer = new IntersectionObserver(([entry]) => {
      callback(entry)
    }, intersectionObserverOptions)

    observer.observe(ref.current)

    return () => {
      observer.disconnect()
    }
  }, [callback, intersectionObserverOptions, options.disabled, ref])
}

/**
 * Preact hook to take a forwarded ref and returns a `ref` that can be used on a DOM element.
 *
 * @param ref - The forwarded ref
 * @returns The inner ref returned by `useRef`
 * @example
 * ```tsx
 * const MyComponent = forwardRef((props, ref) => {
 *  const innerRef = useForwardedRef(ref)
 *  return <div ref={innerRef} />
 * })
 * ```
 */
export function useForwardedRef<T>(ref?: Ref<T> | null) {
  const innerRef = useRef<T>(null)
  if (ref) {
    useImperativeHandle(ref, () => innerRef.current!, [])
  }
  return innerRef
}
