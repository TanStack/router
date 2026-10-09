import { dirname, join } from 'node:path'
import { createServer } from 'vite'
import solid from 'vite-plugin-solid'
import { vi } from 'vitest'
import type { Plugin } from 'vite'

// Solid hydration needs the app compiled twice: `generate: 'ssr'` for the
// server render and `generate: 'dom', hydratable: true` for the client. Neither
// unit-test suite compiles hydratable client code, so both sides run through
// their own Vite module graphs (the test's jsdom globals serve as the browser).
// A fixture directory provides `server-entry.tsx` and `client-entry.tsx`.

const testsDir = dirname(new URL(import.meta.url).pathname)
const packageRoot = dirname(testsDir)

function createSsrServer() {
  return createServer({
    configFile: false,
    root: packageRoot,
    logLevel: 'silent',
    plugins: [solid({ ssr: true, hot: false })],
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom',
    ssr: {
      noExternal: [/solid-js/, /@solidjs\//, /@tanstack\//],
      resolve: {
        conditions: ['node', 'module', 'development|production'],
        externalConditions: ['node'],
      },
    },
  })
}

/** Loads modules with browser resolution and hydratable DOM compilation. */
function createClientServer() {
  const base = solid({ ssr: true, hot: false })
  const transform = base.transform as Extract<
    NonNullable<Plugin['transform']>,
    (...args: Array<any>) => any
  >
  // Compile SSR-loaded modules as hydratable client code.
  const hydratableDom: Plugin = {
    ...base,
    transform(source, id, options) {
      return transform.call(this, source, id, {
        ...options!,
        ssr: false,
      })
    },
  }
  return createServer({
    configFile: false,
    root: packageRoot,
    logLevel: 'silent',
    plugins: [hydratableDom],
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom',
    ssr: {
      noExternal: [/solid-js/, /@solidjs\//, /@tanstack\//, /seroval/],
      resolve: {
        conditions: ['browser', 'module', 'development|production'],
        externalConditions: ['browser'],
      },
    },
  })
}

/**
 * Renders `fixtureDir/server-entry.tsx`'s `renderDocument(...args)` and loads
 * the response as the current document at `path`.
 */
export async function loadServerDocument(
  fixtureDir: string,
  path: string,
  ...args: Array<unknown>
) {
  let html: string
  const server = await createSsrServer()
  try {
    const serverEntry = await server.ssrLoadModule(
      join(testsDir, fixtureDir, 'server-entry.tsx'),
    )
    html = await serverEntry.renderDocument(...args)
  } finally {
    await server.close()
  }
  const serverDocument = new DOMParser().parseFromString(html, 'text/html')
  // The SSR bootstrap scripts run, then remove themselves, before the client
  // entry hydrates.
  const currentScript = vi.spyOn(document, 'currentScript', 'get')
  for (const script of serverDocument.querySelectorAll('script')) {
    currentScript.mockReturnValue(script)
    new Function(script.textContent ?? '')()
    script.remove()
  }
  currentScript.mockRestore()
  window.history.replaceState(null, '', path)
  // The root route renders `<html>`, so its hydration key must carry over too.
  for (const { name, value } of serverDocument.documentElement.attributes) {
    document.documentElement.setAttribute(name, value)
  }
  document.documentElement.innerHTML = serverDocument.documentElement.innerHTML
}

/**
 * Loads `fixtureDir/client-entry.tsx` in a fresh client module graph, i.e. a
 * fresh page load. Call `close` when done.
 */
export async function loadClientEntry(fixtureDir: string) {
  const client = await createClientServer()
  const clientEntry = await client.ssrLoadModule(
    join(testsDir, fixtureDir, 'client-entry.tsx'),
  )
  return { clientEntry, close: () => client.close() }
}

/** Solid reports hydration mismatches through the console. */
export function recordHydrationErrors() {
  const hydrationErrors: Array<string> = []
  const record = (...args: Array<unknown>) => {
    const message = args.map(String).join(' ')
    if (/hydrat/i.test(message)) {
      hydrationErrors.push(message)
    }
  }
  vi.spyOn(console, 'error').mockImplementation(record)
  vi.spyOn(console, 'warn').mockImplementation(record)
  return hydrationErrors
}

/** Clears the page globals, so the next document is a fresh page load. */
export function resetDocument() {
  delete window.$_TSR
  // Solid's `HydrationScript` keeps an existing `_$HY`, which records that
  // the previous page finished hydrating.
  delete (window as { _$HY?: unknown })._$HY
  delete (window as { $R?: unknown }).$R
  for (const { name } of [...document.documentElement.attributes]) {
    document.documentElement.removeAttribute(name)
  }
  document.documentElement.innerHTML = '<head></head><body></body>'
  window.history.replaceState(null, '', '/')
}
