import type { AnyStartInstanceOptions } from '@tanstack/start-client-core'

export { useServerFn } from './useServerFn'
export * from '@tanstack/start-client-core'

export type NativeScriptStartOptions = Omit<AnyStartInstanceOptions, '~types'>

interface NativeScriptStartWindow {
  __TSS_START_OPTIONS__?: AnyStartInstanceOptions
}

/** Create a native fetch wrapper that satisfies Start's origin CSRF check. */
export function createNativeScriptServerFnFetch(
  fetchImplementation: typeof fetch = globalThis.fetch,
): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    const requestHeaders =
      typeof Request !== 'undefined' && input instanceof Request
        ? input.headers
        : undefined
    const headers = new Headers(requestHeaders)

    new Headers(init?.headers).forEach((value, key) => {
      headers.set(key, value)
    })

    if (!headers.has('Origin')) {
      const href =
        typeof Request !== 'undefined' && input instanceof Request
          ? input.url
          : String(input)
      try {
        headers.set('Origin', new URL(href).origin)
      } catch {
        // Relative requests keep the caller's existing origin behavior.
      }
    }

    return fetchImplementation(input, { ...init, headers })
  }) as typeof fetch
}

/** Configure Start's client runtime before mounting the NativeScript app. */
export function configureNativeScriptStart(
  options: NativeScriptStartOptions = {},
): void {
  if (typeof window === 'undefined') {
    throw new Error(
      'NativeScript Start requires dominative globals. Import the NativeScript React renderer before calling configureNativeScriptStart().',
    )
  }

  const runtimeWindow = window as Window & NativeScriptStartWindow
  const previous = runtimeWindow.__TSS_START_OPTIONS__
  const serverFnFetch =
    options.serverFns?.fetch ??
    previous?.serverFns?.fetch ??
    createNativeScriptServerFnFetch()
  runtimeWindow.__TSS_START_OPTIONS__ = {
    ...previous,
    ...options,
    serverFns:
      previous?.serverFns || options.serverFns
        ? {
            ...previous?.serverFns,
            ...options.serverFns,
            fetch: serverFnFetch,
          }
        : { fetch: serverFnFetch },
  } as AnyStartInstanceOptions
}
