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

export type UnionToIntersection<T> = (
  T extends any ? (k: T) => void : never
) extends (k: infer I) => any
  ? I
  : never

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
    : Omit<TLeft, keyof TRight> & TRight

export type Timeout = ReturnType<typeof setTimeout>

export type Updater<TPrevious, TResult = TPrevious> =
  | TResult
  | ((prev?: TPrevious) => TResult)

export type NonNullableUpdater<TPrevious, TResult = TPrevious> =
  | TResult
  | ((prev: TPrevious) => TResult)

// from https://github.com/type-challenges/type-challenges/issues/737
type LastInUnion<T> =
  UnionToIntersection<T extends unknown ? (x: T) => 0 : never> extends (
    x: infer L,
  ) => 0
    ? L
    : never
export type UnionToTuple<T, TLast = LastInUnion<T>> = [T] extends [never]
  ? []
  : [...UnionToTuple<Exclude<T, TLast>>, TLast]

//

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
      const key = array ? i : nextItems[i]
      if (
        !array &&
        prev[key] === undefined &&
        next[key] === undefined &&
        prevItems.includes(key)
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

export function isPlainArray(value: unknown) {
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
    const aKeys = Object.keys(a)
    const bKeys = Object.keys(b)

    if (!partial && aKeys.length !== bKeys.length) {
      return false
    }

    return !bKeys.some(
      (key) => !(key in a) || !deepEqual(a[key], b[key], partial),
    )
  }

  if (Array.isArray(a) && Array.isArray(b)) {
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

export type StrictOrFrom<TFrom, TReturnIntersection extends boolean = false> =
  | {
      from: StringLiteral<TFrom> | TFrom
      strict?: true
    }
  | {
      from?: never
      strict: false
      experimental_returnIntersection?: TReturnIntersection
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

export function removeTrailingSlash(value: string): string {
  if (value.endsWith('/') && value !== '/') {
    return value.slice(0, -1)
  }
  return value
}

// intended to only compare path name
// see the usage in the isActive under useLinkProps
// /sample/path1 = /sample/path1/
// /sample/path1/some <> /sample/path1
export function exactPathTest(pathName1: string, pathName2: string): boolean {
  return removeTrailingSlash(pathName1) === removeTrailingSlash(pathName2)
}

export type ControlledPromise<T> = Promise<T> & {
  resolve: (value: T) => void
  reject: (value: any) => void
  status: 'pending' | 'resolved' | 'rejected'
}

export function createControlledPromise<T>(onResolve?: () => void) {
  let resolveLoadPromise!: () => void
  let rejectLoadPromise!: (value: any) => void

  const controlledPromise = new Promise<void>((resolve, reject) => {
    resolveLoadPromise = resolve
    rejectLoadPromise = reject
  }) as ControlledPromise<T>

  controlledPromise.status = 'pending'

  controlledPromise.resolve = () => {
    controlledPromise.status = 'resolved'
    resolveLoadPromise()
    onResolve?.()
  }

  controlledPromise.reject = (e) => {
    controlledPromise.status = 'rejected'
    rejectLoadPromise(e)
  }

  return controlledPromise
}
