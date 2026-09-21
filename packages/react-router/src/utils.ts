'use client'
import * as React from 'react'
import { isServer } from '@tanstack/router-core/isServer'

/**
 * React.use if available (React 19+), undefined otherwise.
 * Reflect.get avoids a static React.use reference that bundlers reject with React 18.
 * A variable key is not enough: package builds can fold React[key] into React["use"].
 */
export const reactUse:
  | (<T>(usable: Promise<T> | React.Context<T>) => T)
  | undefined = Reflect.get(React, 'use')

export function useStableCallback<T extends (...args: Array<any>) => any>(
  fn: T,
): T {
  const fnRef = React.useRef(fn)
  fnRef.current = fn

  const ref = React.useRef((...args: Array<any>) => fnRef.current(...args))
  return ref.current as T
}

export const useLayoutEffect =
  (isServer ?? typeof window === 'undefined')
    ? React.useEffect
    : React.useLayoutEffect

/**
 * Taken from https://www.developerway.com/posts/implementing-advanced-use-previous-hook#part3
 */
export function usePrevious<T>(value: T): T | null {
  // initialise the ref with previous and current values
  const ref = React.useRef<{ value: T; prev: T | null }>({
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
