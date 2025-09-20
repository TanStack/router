import type { Register } from '@tanstack/router-core'

type BaseContext = {
  nonce?: string
}

export type RequestOptions =
  Register['server']['requestContext'] extends undefined
    ? { context?: Register['server']['requestContext'] & BaseContext }
    : { context: Register['server']['requestContext'] & BaseContext }

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
