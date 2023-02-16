export const FormError = Error
export const ServerError = Error

export interface FetchEvent {
  request: Request
  env: any
  locals: Record<string, unknown>
}

export interface ServerFunctionEvent extends FetchEvent {
  fetch(url: string, init: RequestInit): Promise<Response>
  // $type: typeof FETCH_EVENT
}
