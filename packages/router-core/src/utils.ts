import type { RouteIds } from './routeInfo'
import type { AnyRouter } from './router'

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

export type PickOptional<T> = {
  [K in keyof T as undefined extends T[K] ? K : never]: T[K]
}

// from https://stackoverflow.com/a/76458160
export type WithoutEmpty<T> = T extends any ? ({} extends T ? never : T) : never

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

export type IsNonEmptyObject<T> = T extends object
  ? keyof T extends never
    ? false
    : true
  : false

export type Assign<TLeft, TRight> = TLeft extends any
  ? TRight extends any
    ? IsNonEmptyObject<TLeft> extends false
      ? TRight
      : IsNonEmptyObject<TRight> extends false
        ? TLeft
        : keyof TLeft & keyof TRight extends never
          ? TLeft & TRight
          : Omit<TLeft, keyof TRight> & TRight
    : never
  : never

export type IntersectAssign<TLeft, TRight> = TLeft extends any
  ? TRight extends any
    ? IsNonEmptyObject<TLeft> extends false
      ? TRight
      : IsNonEmptyObject<TRight> extends false
        ? TLeft
        : TRight & TLeft
    : never
  : never

export type Timeout = ReturnType<typeof setTimeout>

export type Updater<TPrevious, TResult = TPrevious> =
  | TResult
  | ((prev?: TPrevious) => TResult)

export type NonNullableUpdater<TPrevious, TResult = TPrevious> =
  | TResult
  | ((prev: TPrevious) => TResult)

export type ExtractObjects<TUnion> = TUnion extends MergeAllPrimitive
  ? never
  : TUnion

export type PartialMergeAllObject<TUnion> =
  ExtractObjects<TUnion> extends infer TObj
    ? [TObj] extends [never]
      ? never
      : {
          [TKey in TObj extends any ? keyof TObj : never]?: TObj extends any
            ? TKey extends keyof TObj
              ? TObj[TKey]
              : never
            : never
        }
    : never

export type MergeAllPrimitive =
  | ReadonlyArray<any>
  | number
  | string
  | bigint
  | boolean
  | symbol
  | undefined
  | null

export type ExtractPrimitives<TUnion> = TUnion extends MergeAllPrimitive
  ? TUnion
  : TUnion extends object
    ? never
    : TUnion

export type PartialMergeAll<TUnion> =
  | ExtractPrimitives<TUnion>
  | PartialMergeAllObject<TUnion>

export type Constrain<T, TConstraint, TDefault = TConstraint> =
  | (T extends TConstraint ? T : never)
  | TDefault

export type ConstrainLiteral<T, TConstraint, TDefault = TConstraint> =
  | (T & TConstraint)
  | TDefault

/**
 * To be added to router types
 */
export type UnionToIntersection<T> = (
  T extends any ? (arg: T) => any : never
) extends (arg: infer T) => any
  ? T
  : never

/**
 * Merges everything in a union into one object.
 * This mapped type is homomorphic which means it preserves stuff! :)
 */
export type MergeAllObjects<
  TUnion,
  TIntersected = UnionToIntersection<ExtractObjects<TUnion>>,
> = [keyof TIntersected] extends [never]
  ? never
  : {
      [TKey in keyof TIntersected]: TUnion extends any
        ? TUnion[TKey & keyof TUnion]
        : never
    }

export type MergeAll<TUnion> =
  | MergeAllObjects<TUnion>
  | ExtractPrimitives<TUnion>

export type ValidateJSON<T> = ((...args: Array<any>) => any) extends T
  ? unknown extends T
    ? never
    : 'Function is not serializable'
  : { [K in keyof T]: ValidateJSON<T[K]> }

export function last<T>(arr: Array<T>) {
  return arr[arr.length - 1]
}

function isFunction(d: any): d is Function {
  return typeof d === 'function'
}

export function functionalUpdate<TPrevious, TResult = TPrevious>(
  updater: Updater<TPrevious, TResult> | NonNullableUpdater<TPrevious, TResult>,
  previous: TPrevious,
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

function getObjectKeys(obj: any, ignoreUndefined: boolean) {
  let keys = Object.keys(obj)
  if (ignoreUndefined) {
    keys = keys.filter((key) => obj[key] !== undefined)
  }
  return keys
}

export function deepEqual(
  a: any,
  b: any,
  opts?: { partial?: boolean; ignoreUndefined?: boolean },
): boolean {
  if (a === b) {
    return true
  }

  if (typeof a !== typeof b) {
    return false
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    const ignoreUndefined = opts?.ignoreUndefined ?? true
    const aKeys = getObjectKeys(a, ignoreUndefined)
    const bKeys = getObjectKeys(b, ignoreUndefined)

    if (!opts?.partial && aKeys.length !== bKeys.length) {
      return false
    }

    return bKeys.every((key) => deepEqual(a[key], b[key], opts))
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false
    }
    return !a.some((item, index) => !deepEqual(item, b[index], opts))
  }

  return false
}

export type StringLiteral<T> = T extends string
  ? string extends T
    ? string
    : T
  : never

export type ThrowOrOptional<T, TThrow extends boolean> = TThrow extends true
  ? T
  : T | undefined

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

export type ThrowConstraint<
  TStrict extends boolean,
  TThrow extends boolean,
> = TStrict extends false ? (TThrow extends true ? never : TThrow) : TThrow

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
 *
 * @deprecated use `jsesc` instead
 */
export function escapeJSON(jsonString: string) {
  return jsonString
    .replace(/\\/g, '\\\\') // Escape backslashes
    .replace(/'/g, "\\'") // Escape single quotes
    .replace(/"/g, '\\"') // Escape double quotes
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

/**
 * Checks if a string contains URI-encoded special characters (e.g., %3F, %20).
 *
 * @param {string} inputString The string to check.
 * @returns {boolean} True if the string contains URI-encoded characters, false otherwise.
 * @example
 * ```typescript
 * const str1 = "foo%3Fbar";
 * const hasEncodedChars = hasUriEncodedChars(str1); // returns true
 * ```
 */
export function hasUriEncodedChars(inputString: string): boolean {
  // This regex looks for a percent sign followed by two hexadecimal digits
  const pattern = /%[0-9A-Fa-f]{2}/
  return pattern.test(inputString)
}
