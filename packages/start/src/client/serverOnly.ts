// A function that will have its contents removed on the client build and only be available on the server build
// it can accept any value, a function that will return a value, or an async function that will return a value

export function serverOnly<T>(value: () => T): () => T | undefined {
  return value
}
