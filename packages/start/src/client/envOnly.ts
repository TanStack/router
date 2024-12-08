// A function that will only be available in the server build
// If called on the client, it will throw an error

export function serverOnly<TFn extends (...args: any[]) => any>(fn: TFn): TFn {
  return fn
}

// A function that will only be available in the client build
// If called on the server, it will throw an error

export function clientOnly<TFn extends (...args: any[]) => any>(fn: TFn): TFn {
  return fn
}