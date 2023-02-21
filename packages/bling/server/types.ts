export const FormError = Error
export const ServerError = Error

export interface FetchEvent {
  request: Request
  env: any
  locals: Record<string, unknown>
}

export type Serializer = {
  apply: (value: any) => boolean
  serialize: (value: any) => any
}

export type Deserializer = {
  apply: (value: any) => any
  deserialize: (value: any, ctx: ServerFunctionEvent) => any
}

export interface ServerFunctionEvent extends FetchEvent {
  // fetch(url: string, init: RequestInit): Promise<Response>
  // $type: typeof FETCH_EVENT
}

export type ServerFunction<
  E extends any[],
  T extends (...args: [...E]) => any,
> = ((...p: Parameters<T>) => Promise<Awaited<ReturnType<T>>>) & {
  url: string
  fetch: (init: RequestInit) => Promise<Awaited<ReturnType<T>>>
  withRequest: (
    init: Partial<RequestInit>,
  ) => (...p: Parameters<T>) => Promise<Awaited<ReturnType<T>>>
}

export type CreateServerFunction = (<
  E extends any[],
  T extends (...args: [...E]) => any,
>(
  fn: T,
) => ServerFunction<E, T>) & {
  // SERVER
  getHandler: (route: string) => any
  createHandler: (fn: any, hash: string, serverResource: boolean) => any
  registerHandler: (route: string, handler: any) => any
  hasHandler: (route: string) => boolean
  parseRequest: (event: ServerFunctionEvent) => Promise<[string, any[]]>
  respondWith: (
    event: ServerFunctionEvent,
    data: Response | Error | string | object,
    responseType: 'throw' | 'return',
  ) => void
  normalizeArgs: (
    path: string,
    that: ServerFunctionEvent | any,
    args: any[],
    meta: any,
  ) => [any, any[]]
  addSerializer(serializer: Serializer): void

  // CLIENT
  createFetcher(
    route: string,
    serverResource: boolean,
  ): ServerFunction<any, any>
  fetch(route: string, init?: RequestInit): Promise<Response>
  parseResponse: (request: Request, response: Response) => Promise<any>
  createRequestInit: (path: string, args: any[], meta: any) => RequestInit
  addDeserializer(deserializer: Deserializer): void
} & FetchEvent
