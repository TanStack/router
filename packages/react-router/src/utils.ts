import * as React from 'react'

export type NoInfer<T> = [T][T extends any ? 0 : never]
export type IsAny<T, Y, N = T> = 1 extends 0 & T ? Y : N
export type PickAsRequired<T, K extends keyof T> = Omit<T, K> &
  Required<Pick<T, K>>

export type PickRequired<T> = {
  [K in keyof T as undefined extends T[K] ? never : K]: T[K]
}

// from https://stackoverflow.com/a/76458160
export type WithoutEmpty<T> = T extends T ? ({} extends T ? never : T) : never

// export type Expand<T> = T
export type Expand<T> = T extends object
  ? T extends infer O
    ? { [K in keyof O]: O[K] }
    : never
  : T

export type UnionToIntersection<U> = (
  U extends any ? (k: U) => void : never
) extends (k: infer I) => any
  ? I
  : never

export type DeepOptional<T, K extends keyof T> = Pick<DeepPartial<T>, K> &
  Omit<T, K>

export type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>
    }
  : T

export type MakeDifferenceOptional<T, U> = Omit<U, keyof T> &
  Partial<Pick<U, keyof T & keyof U>> &
  PickRequired<Omit<U, keyof PickRequired<T>>>

// from https://stackoverflow.com/a/53955431
export type IsUnion<T, U extends T = T> = (
  T extends any ? (U extends T ? false : true) : never
) extends false
  ? false
  : true

// type Compute<T> = { [K in keyof T]: T[K] } | never

// type AllKeys<T> = T extends any ? keyof T : never

// export type MergeUnion<T, Keys extends keyof T = keyof T> = Compute<
//   {
//     [K in Keys]: T[Keys]
//   } & {
//     [K in AllKeys<T>]?: T extends any
//       ? K extends keyof T
//         ? T[K]
//         : never
//       : never
//   }
// >

export type Assign<Left, Right> = Omit<Left, keyof Right> & Right

export type AssignAll<T extends any[]> = T extends [infer Left, ...infer Right]
  ? Right extends any[]
    ? Assign<Left, AssignAll<Right>>
    : Left
  : {}

// // Sample types to merge
// type TypeA = {
//   shared: string
//   onlyInA: string
//   nested: {
//     shared: string
//     aProp: string
//   }
//   array: string[]
// }

// type TypeB = {
//   shared: number
//   onlyInB: number
//   nested: {
//     shared: number
//     bProp: number
//   }
//   array: number[]
// }

// type TypeC = {
//   shared: boolean
//   onlyInC: boolean
//   nested: {
//     shared: boolean
//     cProp: boolean
//   }
//   array: boolean[]
// }

// type Test = Expand<Assign<TypeA, TypeB>>

// // Using DeepMerge to merge TypeA and TypeB
// type MergedType = Expand<AssignAll<[TypeA, TypeB, TypeC]>>

export type Timeout = ReturnType<typeof setTimeout>

export type Updater<TPrevious, TResult = TPrevious> =
  | TResult
  | ((prev?: TPrevious) => TResult)

export type NonNullableUpdater<TPrevious, TResult = TPrevious> =
  | TResult
  | ((prev: TPrevious) => TResult)

// from https://github.com/type-challenges/type-challenges/issues/737
type LastInUnion<U> =
  UnionToIntersection<U extends unknown ? (x: U) => 0 : never> extends (
    x: infer L,
  ) => 0
    ? L
    : never
export type UnionToTuple<U, Last = LastInUnion<U>> = [U] extends [never]
  ? []
  : [...UnionToTuple<Exclude<U, Last>>, Last]

//

export const isServer = typeof document === 'undefined'

export function last<T>(arr: T[]) {
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
    return updater(previous as TResult)
  }

  return updater
}

export function pick<T, K extends keyof T>(parent: T, keys: K[]): Pick<T, K> {
  return keys.reduce((obj: any, key: K) => {
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

export function useStableCallback<T extends (...args: any[]) => any>(fn: T): T {
  const fnRef = React.useRef(fn)
  fnRef.current = fn

  const ref = React.useRef((...args: any[]) => fnRef.current(...args))
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

  for (let i = 0; i < keysA.length; i++) {
    if (
      !Object.prototype.hasOwnProperty.call(objB, keysA[i] as string) ||
      !Object.is(objA[keysA[i] as keyof T], objB[keysA[i] as keyof T])
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

export function escapeJSON(jsonString: string) {
  return jsonString
    .replace(/\\/g, '\\\\') // Escape backslashes
    .replace(/'/g, "\\'") // Escape single quotes
    .replace(/"/g, '\\"') // Escape double quotes
}
