export type NoInfer<T> = [T][T extends any ? 0 : never]
export type IsAny<T, Y, N> = 1 extends 0 & T ? Y : N
export type IsAnyBoolean<T> = 1 extends 0 & T ? true : false
export type IsKnown<T, Y, N> = unknown extends T ? N : Y
export type PickAsRequired<T, K extends keyof T> = Omit<T, K> &
  Required<Pick<T, K>>
export type PickAsPartial<T, K extends keyof T> = Omit<T, K> &
  Partial<Pick<T, K>>
export type PickUnsafe<T, K> = K extends keyof T ? Pick<T, K> : never
export type PickExtra<T, K> = Expand<{
  [TKey in keyof K as string extends TKey
    ? never
    : TKey extends keyof T
    ? never
    : TKey]: K[TKey]
}>
export type PickRequired<T> = {
  [K in keyof T as undefined extends T[K] ? never : K]: T[K]
}

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

export type Values<O> = O[ValueKeys<O>]
export type ValueKeys<O> = Extract<keyof O, PropertyKey>

export type DeepAwaited<T> = T extends Promise<infer A>
  ? DeepAwaited<A>
  : T extends Record<infer A, Promise<infer B>>
  ? { [K in A]: DeepAwaited<B> }
  : T

export type PathParamMask<TRoutePath extends string> =
  TRoutePath extends `${infer L}/$${infer C}/${infer R}`
    ? PathParamMask<`${L}/${string}/${R}`>
    : TRoutePath extends `${infer L}/$${infer C}`
    ? PathParamMask<`${L}/${string}`>
    : TRoutePath

export type Timeout = ReturnType<typeof setTimeout>

export type Updater<TPrevious, TResult = TPrevious> =
  | TResult
  | ((prev?: TPrevious) => TResult)

export type PickExtract<T, U> = {
  [K in keyof T as T[K] extends U ? K : never]: T[K]
}

export type PickExclude<T, U> = {
  [K in keyof T as T[K] extends U ? never : K]: T[K]
}

export function last<T>(arr: T[]) {
  return arr[arr.length - 1]
}

export function warning(cond: any, message: string): cond is true {
  if (cond) {
    if (typeof console !== 'undefined') console.warn(message)

    try {
      throw new Error(message)
    } catch {}
  }

  return true
}

function isFunction(d: any): d is Function {
  return typeof d === 'function'
}

export function functionalUpdate<TResult>(
  updater: Updater<TResult>,
  previous: TResult,
) {
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
