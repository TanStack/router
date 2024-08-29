import * as React from 'react'

export type NoInfer<T> = [T][T extends any ? 0 : never]
export type IsAny<TValue, TYesResult, TNoResult = TValue> = 1 extends 0 & TValue
  ? TYesResult
  : TNoResult

export type PickAsRequired<TValue, TKey extends keyof TValue> = Omit<
  TValue,
  TKey
> &
  Required<Pick<TValue, TKey>>

export type PickRequired<T> = {
  [K in keyof T as undefined extends T[K] ? never : K]: T[K]
}

// from https://stackoverflow.com/a/76458160
export type WithoutEmpty<T> = T extends any ? ({} extends T ? never : T) : never

// export type Expand<T> = T
export type Expand<T> = T extends object
  ? T extends infer O
    ? O extends Function
      ? O
      : { [K in keyof O]: O[K] }
    : never
  : T

export type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>
    }
  : T

export type MakeDifferenceOptional<TLeft, TRight> = Omit<
  TRight,
  keyof TLeft
> & {
  [K in keyof TLeft & keyof TRight]?: TRight[K]
}

// from https://stackoverflow.com/a/53955431
// eslint-disable-next-line @typescript-eslint/naming-convention
export type IsUnion<T, U extends T = T> = (
  T extends any ? (U extends T ? false : true) : never
) extends false
  ? false
  : true

export type Assign<TLeft, TRight> = keyof TLeft extends never
  ? TRight
  : keyof TRight extends never
    ? TLeft
    : keyof TLeft & keyof TRight extends never
      ? TLeft & TRight
      : Omit<TLeft, keyof TRight> & TRight

export type Timeout = ReturnType<typeof setTimeout>

export type Updater<TPrevious, TResult = TPrevious> =
  | TResult
  | ((prev?: TPrevious) => TResult)

export type NonNullableUpdater<TPrevious, TResult = TPrevious> =
  | TResult
  | ((prev: TPrevious) => TResult)

export type MergeUnionObjects<TUnion> = TUnion extends MergeUnionPrimitive
  ? never
  : TUnion

export type MergeUnionObject<TUnion> =
  MergeUnionObjects<TUnion> extends infer TObj
    ? {
        [TKey in TObj extends any ? keyof TObj : never]?: TObj extends any
          ? TKey extends keyof TObj
            ? TObj[TKey]
            : never
          : never
      }
    : never

export type MergeUnionPrimitive =
  | ReadonlyArray<any>
  | number
  | string
  | bigint
  | boolean
  | symbol

export type MergeUnionPrimitives<TUnion> = TUnion extends MergeUnionPrimitive
  ? TUnion
  : TUnion extends object
    ? never
    : TUnion

export type MergeUnion<TUnion> =
  | MergeUnionPrimitives<TUnion>
  | MergeUnionObject<TUnion>

export type Constrain<T, TConstaint, TDefault = TConstaint> =
  | (T extends TConstaint ? T : never)
  | TDefault

export function last<T>(arr: Array<T>) {
  return arr[arr.length - 1]
}

function isFunction(d: any): d is Function {
  return typeof d === 'function'
}

export function functionalUpdate<TResult>(
  updater: Updater<TResult> | NonNullableUpdater<TResult>,
  previous: TResult,
): TResult {
  if (isFunction(updater)) {
    return updater(previous)
  }

  return updater
}

export function pick<TValue, TKey extends keyof TValue>(
  parent: TValue,
  keys: Array<TKey>,
): Pick<TValue, TKey> {
  return keys.reduce((obj: any, key: TKey) => {
    obj[key] = parent[key]
    return obj
  }, {} as any)
}

/**
 * This function returns `prev` if `_next` is deeply equal.
 * If not, it will replace any deeply equal children of `b` with those of `a`.
 * This can be used for structural sharing between immutable JSON values for example.
 * Do not use this with signals
 */
export function replaceEqualDeep<T>(prev: any, _next: T): T {
  if (prev === _next) {
    return prev
  }

  const next = _next as any

  const array = isPlainArray(prev) && isPlainArray(next)

  if (array || (isPlainObject(prev) && isPlainObject(next))) {
    const prevItems = array ? prev : Object.keys(prev)
    const prevSize = prevItems.length
    const nextItems = array ? next : Object.keys(next)
    const nextSize = nextItems.length
    const copy: any = array ? [] : {}

    let equalItems = 0

    for (let i = 0; i < nextSize; i++) {
      const key = array ? i : (nextItems[i] as any)
      if (
        ((!array && prevItems.includes(key)) || array) &&
        prev[key] === undefined &&
        next[key] === undefined
      ) {
        copy[key] = undefined
        equalItems++
      } else {
        copy[key] = replaceEqualDeep(prev[key], next[key])
        if (copy[key] === prev[key] && prev[key] !== undefined) {
          equalItems++
        }
      }
    }

    return prevSize === nextSize && equalItems === prevSize ? prev : copy
  }

  return next
}

// Copied from: https://github.com/jonschlinkert/is-plain-object
export function isPlainObject(o: any) {
  if (!hasObjectPrototype(o)) {
    return false
  }

  // If has modified constructor
  const ctor = o.constructor
  if (typeof ctor === 'undefined') {
    return true
  }

  // If has modified prototype
  const prot = ctor.prototype
  if (!hasObjectPrototype(prot)) {
    return false
  }

  // If constructor does not have an Object-specific method
  if (!prot.hasOwnProperty('isPrototypeOf')) {
    return false
  }

  // Most likely a plain Object
  return true
}

function hasObjectPrototype(o: any) {
  return Object.prototype.toString.call(o) === '[object Object]'
}

export function isPlainArray(value: unknown): value is Array<unknown> {
  return Array.isArray(value) && value.length === Object.keys(value).length
}

export function deepEqual(a: any, b: any, partial: boolean = false): boolean {
  if (a === b) {
    return true
  }

  if (typeof a !== typeof b) {
    return false
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    const aKeys = Object.keys(a).filter((key) => a[key] !== undefined)
    const bKeys = Object.keys(b).filter((key) => b[key] !== undefined)

    if (!partial && aKeys.length !== bKeys.length) {
      return false
    }

    return !bKeys.some(
      (key) => !(key in a) || !deepEqual(a[key], b[key], partial),
    )
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false
    }
    return !a.some((item, index) => !deepEqual(item, b[index], partial))
  }

  return false
}

export function useStableCallback<T extends (...args: Array<any>) => any>(
  fn: T,
): T {
  const fnRef = React.useRef(fn)
  fnRef.current = fn

  const ref = React.useRef((...args: Array<any>) => fnRef.current(...args))
  return ref.current as T
}

export function shallow<T>(objA: T, objB: T) {
  if (Object.is(objA, objB)) {
    return true
  }

  if (
    typeof objA !== 'object' ||
    objA === null ||
    typeof objB !== 'object' ||
    objB === null
  ) {
    return false
  }

  const keysA = Object.keys(objA)
  if (keysA.length !== Object.keys(objB).length) {
    return false
  }

  for (const item of keysA) {
    if (
      !Object.prototype.hasOwnProperty.call(objB, item) ||
      !Object.is(objA[item as keyof T], objB[item as keyof T])
    ) {
      return false
    }
  }
  return true
}

export type StringLiteral<T> = T extends string
  ? string extends T
    ? string
    : T
  : never

export type StrictOrFrom<
  TFrom,
  TStrict extends boolean = true,
> = TStrict extends false
  ? {
      from?: never
      strict: TStrict
    }
  : {
      from: StringLiteral<TFrom> | TFrom
      strict?: TStrict
    }

export const useLayoutEffect =
  typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect

/**
 *
 * @deprecated use `jsesc` instead
 */
export function escapeJSON(jsonString: string) {
  return jsonString
    .replace(/\\/g, '\\\\') // Escape backslashes
    .replace(/'/g, "\\'") // Escape single quotes
    .replace(/"/g, '\\"') // Escape double quotes
}

export type ControlledPromise<T> = Promise<T> & {
  resolve: (value: T) => void
  reject: (value: any) => void
  status: 'pending' | 'resolved' | 'rejected'
  value?: T
}

export function createControlledPromise<T>(onResolve?: (value: T) => void) {
  let resolveLoadPromise!: (value: T) => void
  let rejectLoadPromise!: (value: any) => void

  const controlledPromise = new Promise<T>((resolve, reject) => {
    resolveLoadPromise = resolve
    rejectLoadPromise = reject
  }) as ControlledPromise<T>

  controlledPromise.status = 'pending'

  controlledPromise.resolve = (value: T) => {
    controlledPromise.status = 'resolved'
    controlledPromise.value = value
    resolveLoadPromise(value)
    onResolve?.(value)
  }

  controlledPromise.reject = (e) => {
    controlledPromise.status = 'rejected'
    rejectLoadPromise(e)
  }

  return controlledPromise
}

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
