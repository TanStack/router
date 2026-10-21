/**
 * Only surviving edges are reported (SPEC J6.4): a denied import used only
 * inside code the Start compiler removes from an environment (a safe
 * boundary: a server fn handler, `createServerOnlyFn`, a middleware's
 * `.server()`, `createIsomorphicFn().server()` on the client;
 * `createClientOnlyFn`, `createIsomorphicFn().client()` on the server) is no
 * edge of that environment, so a dev server reports nothing for it, whatever
 * way the boundary is written; a use the environment keeps is reported (one
 * per environment: `src/cases/leaky.ts`, `src/cases/server-leaky.ts`), and
 * the server keeps a handler's use (the handler runs with the real module).
 * Read on dev servers with Start's whole public plugin (mock mode), Vite
 * and Rsbuild, from what each reports (`locatedImporters`). Each case is a
 * module of its own under `src/cases/`.
 *
 * Replaces the internal control that compiled each case with today's
 * compiler and read its imports (`outside-compiler-corpus/importProtection/
 * analysis.survival.test.ts`). Where a surviving use is reported:
 * `reported-location.test.ts`.
 */
import { afterAll, describe, expect, test } from 'vitest'
import { runInRequestContext } from '../../build-harness'
import { startDevServer } from '../../dev-server'
import { startRsbuildDevServer } from '../../rsbuild-dev-server'
import { locatedImporters } from '../../importProtection/start-apps'
import type { DevServer } from '@tanstack/compiler-test-utils/dev-server'

const timeout = 30_000

/** A package `name` whose `denied` gives `REAL_<name>`. */
const sdk = (name: string) => ({
  [`node_modules/${name}/package.json`]: JSON.stringify({
    name,
    type: 'module',
    exports: './index.js',
  }),
  [`node_modules/${name}/index.js`]: `export const denied = () => 'REAL_${name}'\n`,
})

const header = (
  sdkName: string,
) => `import { createServerFn, createServerOnlyFn, createClientOnlyFn, createIsomorphicFn, createMiddleware } from '@tanstack/react-start'
import { denied } from '${sdkName}'
`

/**
 * Uses of `server-sdk` (denied to the client) inside a boundary the client
 * drops.
 */
const clientBoundaries: Record<string, string> = {
  'createServerFn().handler': `export const fn = createServerFn().handler(async () => denied())`,
  'a parenthesized createServerFn().handler argument': `export const fn = createServerFn().handler((() => denied()))`,
  'a wrapped createServerFn().handler argument': `const withAuth = <T,>(fn: T) => fn
export const fn = createServerFn().handler(withAuth(async () => denied()))`,
  'a createServerFn().handler argument with a type assertion': `export const fn = createServerFn().handler((async () => denied()) as any)`,
  'createServerFn().handler through a namespace import': `import * as Start from '@tanstack/react-start'
export const fn = Start.createServerFn().handler(() => denied())`,
  'createServerOnlyFn through a namespace import': `import * as Start from '@tanstack/react-start'
export const fn = Start.createServerOnlyFn(() => denied())`,
  'a handler after a validator': `export const fn = createServerFn({ method: 'GET' }).validator((d: unknown) => d).handler(() => denied())`,
  createServerOnlyFn: `export const fn = createServerOnlyFn(() => denied())`,
  'createMiddleware().server': `export const middleware = createMiddleware({ type: 'function' }).server(({ next }) => {
  const secret = denied()
  return next({ context: { secret } })
})`,
  'createIsomorphicFn().server': `export const fn = createIsomorphicFn().server(() => denied())`,
}

/**
 * Uses of `browser-sdk` (denied to the server) inside a boundary the server
 * drops.
 */
const serverBoundaries: Record<string, string> = {
  createClientOnlyFn: `export const fn = createClientOnlyFn(() => denied())`,
  'a createClientOnlyFn argument with a satisfies clause': `export const fn = createClientOnlyFn((() => denied()) satisfies () => unknown)`,
  'a parenthesized createIsomorphicFn().client argument': `export const fn = createIsomorphicFn().client((() => denied()))`,
}

/** A use after a handler, which the client keeps. */
const leaky = `export const fn = createServerFn().handler(async () => {
  return denied()
})
export function leakyReference() {
  return denied()
}`

/** A use outside a client-only boundary, which the server keeps. */
const serverLeaky = `export const fn = createClientOnlyFn(() => denied())
export const leak = () => denied()`

const slug = (name: string) =>
  name
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()

const files: Record<string, string> = {
  ...sdk('server-sdk'),
  ...sdk('browser-sdk'),
  ...Object.fromEntries([
    ...Object.entries(clientBoundaries).map(([name, body]) => [
      `src/cases/client-${slug(name)}.ts`,
      header('server-sdk') + body + '\n',
    ]),
    ...Object.entries(serverBoundaries).map(([name, body]) => [
      `src/cases/server-${slug(name)}.ts`,
      header('browser-sdk') + body + '\n',
    ]),
    ['src/cases/leaky.ts', header('server-sdk') + leaky + '\n'],
    ['src/cases/server-leaky.ts', header('browser-sdk') + serverLeaky + '\n'],
  ]),
}
files['src/entry.ts'] = Object.keys(files)
  .filter((file) => file.startsWith('src/cases/'))
  .map(
    (file, index) =>
      `export * as c${index} from './${file.slice('src/'.length, -'.ts'.length)}'`,
  )
  .join('\n')

const importProtection = {
  client: { specifiers: ['server-sdk'] },
  server: { specifiers: ['browser-sdk'] },
  mockAccess: 'off' as const,
}

describe('vite dev', () => {
  const cleanups: Array<() => Promise<void>> = []
  afterAll(async () => {
    await Promise.all(cleanups.map((cleanup) => cleanup()))
  })
  let started: Promise<DevServer> | undefined
  /**
   * The dev server (router entry `src/entry.ts`), started once for the
   * file, with the client and the server having loaded the app.
   */
  const loaded = () =>
    (started ??= (async () => {
      const server = await startDevServer({
        files,
        registerCleanup: (cleanup) => cleanups.push(cleanup),
        start: { router: { entry: 'entry.ts' }, importProtection },
      })
      await server.load('/src/entry.ts')
      await server.import('/src/entry.ts', 'ssr')
      return server
    })())

  test(
    'the client reports only the use it keeps, not the uses inside the boundaries it drops',
    async () => {
      const located = locatedImporters((await loaded()).logs, files)
      expect([
        ...new Set(located.filter((entry) => entry.startsWith('client '))),
      ]).toEqual(['client src/cases/leaky.ts'])
    },
    timeout,
  )

  test(
    'the server reports only the use it keeps, not the uses inside the boundaries it drops',
    async () => {
      const located = locatedImporters((await loaded()).logs, files)
      expect([
        ...new Set(located.filter((entry) => entry.startsWith('server '))),
      ]).toEqual(['server src/cases/server-leaky.ts'])
    },
    timeout,
  )

  test(
    "the server keeps a handler's use: the handler runs with the real module",
    async () => {
      const server = await loaded()
      const { fn } = await server.import(
        `/src/cases/client-${slug('createServerFn().handler')}.ts`,
        'ssr',
      )
      expect(await runInRequestContext(() => fn())).toBe('REAL_server-sdk')
    },
    timeout,
  )
})

describe('rsbuild dev', () => {
  test(
    'each environment reports only the use it keeps',
    async () => {
      const server = await startRsbuildDevServer({ files, importProtection })
      expect([...new Set(locatedImporters(server, files))].sort()).toEqual([
        'client src/cases/leaky.ts',
        'server src/cases/server-leaky.ts',
      ])
    },
    timeout,
  )
})
