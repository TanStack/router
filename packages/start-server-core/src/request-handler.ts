import type { Register } from '@tanstack/router-core'

type MirrorProp<
  TSource,
  TKey extends keyof TSource,
  TNewName extends string,
> = undefined extends TSource[TKey]
  ? { [P in TNewName]?: TSource[TKey] }
  : { [P in TNewName]: TSource[TKey] }

export interface RequestOptions
  extends MirrorProp<Register['server'], 'requestContext', 'context'> {}
// Utility type: true if T has any required keys, else false
type HasRequired<T> = keyof T extends never
  ? false
  : {
        [K in keyof T]-?: undefined extends T[K] ? never : K
      }[keyof T] extends never
    ? false
    : true

export type RequestHandler =
  HasRequired<RequestOptions> extends true
    ? (request: Request, opts: RequestOptions) => Promise<Response> | Response
    : (request: Request, opts?: RequestOptions) => Promise<Response> | Response
