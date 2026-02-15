import { useLayoutEffect as preactUseLayoutEffect, useEffect, useRef } from 'preact/hooks'
import type { RefObject } from 'preact'

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
  const ref = useRef<{ value: T; prev: T | null }>({
    value: value,
    prev: null,
  })

  const current = ref.current.value

  if (value !== current) {
    ref.current = {
      value: value,
      prev: current,
    }
  }

  return ref.current.prev
}

/**
 * Preact hook to wrap `IntersectionObserver`.
 */
export function useIntersectionObserver<T extends Element>(
  ref: RefObject<T | null>,
  callback: (entry: IntersectionObserverEntry | undefined) => void,
  intersectionObserverOptions: IntersectionObserverInit = {},
  options: { disabled?: boolean } = {},
) {
  useEffect(() => {
    if (
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
