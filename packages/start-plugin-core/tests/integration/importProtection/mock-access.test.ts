/**
 * The runtime side of dev mocks on a Vite dev server with Start's whole
 * public plugin (SPEC J6.3, J6.8): in the browser, a client import of a
 * denied file or of a denied specifier gets a safe mock whatever
 * `mockAccess` says, a call of the mock is reported in the browser console
 * with the severity `mockAccess` gives (`error`, `warn`), naming the denied
 * import, and with `mockAccess: 'off'` no use of it is reported or has a side
 * effect. Which other uses of a mock are reported (a conversion to a string,
 * `toString()`, `new`, a property write) is free (ruling "mock access diagnostics"). What is
 * reported is read through the shared diagnostic oracle: the severity and
 * the denied import, never the prose (J6.12). (The Rsbuild twin:
 * `integration/rsbuild/import-protection.test.ts`, "Rsbuild dev:
 * mockAccess"; builds: `build.test.ts`, mock mode.)
 *
 * Replaces the internal controls that evaluated today's generated dev mock
 * modules and mock runtime in process
 * (main's `importProtection/virtualModules.test.ts`).
 */
import { afterAll, describe, expect, test } from 'vitest'
import { startDevServer } from '../../dev-server'
import {
  expectMockAccess,
  probeMockPrelude,
  safeMock,
  warningsAndErrors,
} from '../../importProtection/mock-helpers'
import { clientFixturePlugin, runViteClient } from './client-pages'
import type { ImportProtectionOptions } from '../../importProtection/public-types'
import type { DevServer } from '@tanstack/compiler-test-utils/dev-server'

const timeout = 30_000

/**
 * `src/secret.server.ts` (a denied file) and `db-lib` (a package denied by
 * a specifier rule), both used by the client through `src/uses.ts`.
 */
const files = {
  'node_modules/db-lib/package.json': JSON.stringify({
    name: 'db-lib',
    type: 'module',
    exports: { '.': './index.js' },
  }),
  'node_modules/db-lib/index.js': `export const query = () => 'MARK_LIB'\n`,
  'src/secret.server.ts': `export const getSecret = () => 'MARK_SECRET'
export const api = { Client: class {} }
`,
  'src/uses.ts': `import { api, getSecret } from './secret.server'
import { query } from 'db-lib'
export const denied = { getSecret, api, query }
`,
  'src/entry.ts': `export { denied } from './uses'\n`,
}

/** The denied imports and how a report may name each. */
const deniedImports = [
  {
    name: 'getSecret',
    specifier: './secret.server',
    file: 'src/secret.server.ts',
  },
  { name: 'query', specifier: 'db-lib' },
] as const

/** Uses of a mock a page may make, as page scripts on `value`. */
const uses: Record<string, string> = {
  'a call': `value()`,
  'a conversion to a string': `String(value)`,
  'a toString() call': `value.toString()`,
  '`new`': `new value()`,
  'a property write': `value.written = 1`,
}

const servers = new Map<string, Promise<DevServer>>()
const cleanups: Array<() => Promise<void>> = []
afterAll(async () => {
  await Promise.all(cleanups.map((cleanup) => cleanup()))
})

/**
 * The dev server of `mockAccess`, started once for the file: Start's whole
 * plugin, the router entry `src/entry.ts`, the page of `client-pages.ts`.
 */
function serverOf(mockAccess: ImportProtectionOptions['mockAccess']) {
  const key = String(mockAccess)
  let server = servers.get(key)
  if (!server) {
    server = startDevServer({
      files,
      browser: true,
      registerCleanup: (cleanup) => cleanups.push(cleanup),
      plugins: [clientFixturePlugin],
      start: {
        router: { entry: 'entry.ts' },
        importProtection: { client: { specifiers: ['db-lib'] }, mockAccess },
      },
    })
    servers.set(key, server)
  }
  return server
}

/**
 * Runs `script` (with the denied value `name` as `value`) in a new page of
 * the server of `mockAccess`: what it returns, and the warnings and errors
 * the page's code logged.
 */
async function inPage(
  mockAccess: ImportProtectionOptions['mockAccess'],
  name: string,
  script: string,
) {
  const server = await serverOf(mockAccess)
  const { result, diagnostics } = await runViteClient(
    server,
    '/src/entry.ts',
    `${probeMockPrelude}
const value = entry.denied.${name}
${script}`,
  )
  return {
    result,
    logged: warningsAndErrors(diagnostics),
    all: diagnostics.map(({ severity, text }) => `${severity}: ${text}`),
  }
}

const modes = ['error', 'warn', 'off'] as const

describe.each(deniedImports)('a client import of $specifier', (denied) => {
  test.each(modes)(
    'mockAccess %s: the client gets a safe mock, and what it gives is one too',
    async (mockAccess) => {
      const { result } = await inPage(
        mockAccess,
        denied.name,
        `return [probeMock(value, 'MARK_'), probeMock(value(), 'MARK_'), probeMock(value.member, 'MARK_')]`,
      )
      expect(result).toEqual([safeMock, safeMock, safeMock])
    },
    timeout,
  )

  test.each([
    { mockAccess: 'error', severity: 'error' },
    { mockAccess: 'warn', severity: 'warning' },
  ] as const)(
    'mockAccess $mockAccess: a call in the client is reported as an $severity naming the import',
    async ({ mockAccess, severity }) => {
      const { logged } = await inPage(mockAccess, denied.name, `value()`)
      expect([...new Set(logged.map((entry) => entry.severity))]).toEqual([
        severity,
      ])
      expectMockAccess(logged, {
        severity,
        specifier: denied.specifier,
        ...('file' in denied && {
          file: denied.file,
          root: (await serverOf(mockAccess)).root,
        }),
      })
    },
    timeout,
  )

  // Silent means no side effect a page can see: nothing logged on any
  // channel at any severity (the same output as a page that does not use
  // the mock), and no global the uses define.
  test(
    'mockAccess off: no use is reported, and the uses have no side effect',
    async () => {
      const control = await inPage('off', denied.name, `return []`)
      const { logged, all, result } = await inPage(
        'off',
        denied.name,
        `const before = new Set(Object.getOwnPropertyNames(globalThis))
${Object.values(uses).join('\n')}
String(value.member())
new value.Client()
return Object.getOwnPropertyNames(globalThis).filter((name) => !before.has(name))`,
      )
      expect(logged).toEqual([])
      expect(all).toEqual(control.all)
      expect(result).toEqual([])
    },
    timeout,
  )
})
