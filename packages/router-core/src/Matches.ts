import type { Constrain } from './utils'

export type AnyMatchAndValue = { match: any; value: any }

export type FindValueByIndex<
  TKey,
  TValue extends ReadonlyArray<any>,
> = TKey extends `${infer TIndex extends number}` ? TValue[TIndex] : never

export type FindValueByKey<TKey, TValue> =
  TValue extends ReadonlyArray<any>
    ? FindValueByIndex<TKey, TValue>
    : TValue[TKey & keyof TValue]

export type CreateMatchAndValue<TMatch, TValue> = TValue extends any
  ? {
      match: TMatch
      value: TValue
    }
  : never

export type NextMatchAndValue<
  TKey,
  TMatchAndValue extends AnyMatchAndValue,
> = TMatchAndValue extends any
  ? CreateMatchAndValue<
      TMatchAndValue['match'],
      FindValueByKey<TKey, TMatchAndValue['value']>
    >
  : never

export type IsMatchKeyOf<TValue> =
  TValue extends ReadonlyArray<any>
    ? number extends TValue['length']
      ? `${number}`
      : keyof TValue & `${number}`
    : TValue extends object
      ? keyof TValue & string
      : never

export type IsMatchPath<
  TParentPath extends string,
  TMatchAndValue extends AnyMatchAndValue,
> = `${TParentPath}${IsMatchKeyOf<TMatchAndValue['value']>}`

export type IsMatchResult<
  TKey,
  TMatchAndValue extends AnyMatchAndValue,
> = TMatchAndValue extends any
  ? TKey extends keyof TMatchAndValue['value']
    ? TMatchAndValue['match']
    : never
  : never

export type IsMatchParse<
  TPath,
  TMatchAndValue extends AnyMatchAndValue,
  TParentPath extends string = '',
> = TPath extends `${string}.${string}`
  ? TPath extends `${infer TFirst}.${infer TRest}`
    ? IsMatchParse<
        TRest,
        NextMatchAndValue<TFirst, TMatchAndValue>,
        `${TParentPath}${TFirst}.`
      >
    : never
  : {
      path: IsMatchPath<TParentPath, TMatchAndValue>
      result: IsMatchResult<TPath, TMatchAndValue>
    }

export type IsMatch<TMatch, TPath> = IsMatchParse<
  TPath,
  TMatch extends any ? { match: TMatch; value: TMatch } : never
>

/**
 * Narrows matches based on a path
 * @experimental
 */
export const isMatch = <TMatch, TPath extends string>(
  match: TMatch,
  path: Constrain<TPath, IsMatch<TMatch, TPath>['path']>,
): match is IsMatch<TMatch, TPath>['result'] => {
  const parts = (path as string).split('.')
  let part
  let value: any = match

  while ((part = parts.shift()) != null && value != null) {
    value = value[part]
  }

  return value != null
}
