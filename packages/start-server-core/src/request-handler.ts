type BaseContext = {
  nonce?: string
}

export type RequestOptions<TRegister> = TRegister extends {
  server: { requestContext: infer TRequestContext }
}
  ? TRequestContext extends undefined
    ? { context?: TRequestContext & BaseContext }
    : { context: TRequestContext & BaseContext }
  : { context?: BaseContext }

// Utility type: true if T has any required keys, else false
type HasRequired<T> = keyof T extends never
  ? false
  : {
        [K in keyof T]-?: undefined extends T[K] ? never : K
      }[keyof T] extends never
    ? false
    : true

export type RequestHandler<TRegister> =
  HasRequired<RequestOptions<TRegister>> extends true
    ? (
        request: Request,
        opts: RequestOptions<TRegister>,
      ) => Promise<Response> | Response
    : (
        request: Request,
        opts?: RequestOptions<TRegister>,
      ) => Promise<Response> | Response
