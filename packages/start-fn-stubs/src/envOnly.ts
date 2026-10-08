type EnvOnlyFn = <TFn extends (...args: Array<any>) => any>(fn: TFn) => TFn

// A function that will only be available in the server build
// If called on the client, it will throw an error
export const createServerOnlyFn: EnvOnlyFn = (fn) => {
  // The compiled client replaces the call, so this stub never runs there.
  // Tests run uncompiled by design.
  if (
    process.env.NODE_ENV !== 'production' &&
    process.env.NODE_ENV !== 'test' &&
    typeof window !== 'undefined'
  ) {
    console.error(
      '[TanStack Start] createServerOnlyFn() was not compiled, so its server code shipped to the client, where it runs instead of throwing. Assign it to a module-level variable (export const fn = createServerOnlyFn(() => ...)), with createServerOnlyFn imported directly from your Start package (e.g. @tanstack/react-start).',
    )
  }
  return fn
}

// A function that will only be available in the client build
// If called on the server, it will throw an error
export const createClientOnlyFn: EnvOnlyFn = (fn) => {
  // The compiled client replaces the call, so this stub never runs there
  if (
    process.env.NODE_ENV !== 'production' &&
    process.env.NODE_ENV !== 'test' &&
    typeof window !== 'undefined'
  ) {
    console.error(
      '[TanStack Start] createClientOnlyFn() was not compiled, so the server runs its client code instead of throwing. Assign it to a module-level variable (export const fn = createClientOnlyFn(() => ...)), with createClientOnlyFn imported directly from your Start package (e.g. @tanstack/react-start).',
    )
  }
  return fn
}
