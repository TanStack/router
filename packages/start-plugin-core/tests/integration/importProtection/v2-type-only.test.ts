/**
 * Type-only imports of a denied file through real hosts (FIX-PLAN V2-22;
 * SPEC J6.2): `import type`, `import { type X }`, `export type { X } from`
 * and `export type * from` of the denied file `src/types.server.ts` are no
 * violation: nothing is reported for their importers and the client never
 * loads the file (it records that it ran). A mixed `import { type X, value }`
 * of the denied file `src/mixed.server.ts` still uses a value: it is
 * reported, and the client gets a safe mock. Client environment, mock mode
 * (dev default; `behavior: 'mock'` in builds), Vite and Rsbuild, builds and
 * dev servers with Start's whole plugin.
 */
import {
  captureConsole,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { afterAll, afterEach, describe, expect, test } from 'vitest'
import { buildStart, startBundlers } from '../../build-harness'
import { describeValuePrelude } from '../../importProtection/mock-helpers'
import {
  runInClient,
  runViteClient,
  startBrowserStartDevServer as startDevServer,
  startBrowserRsbuildStartDevServer as startRsbuildStartDevServer,
} from './client-pages'
import { reportedImporters } from './v2-hosts'
import type { StartBuild } from '../../build-harness'

const timeout = 60_000
const compileTimeout = timeout

afterEach(() => {
  delete (globalThis as Record<string, unknown>).typesLoaded
  delete (globalThis as Record<string, unknown>).mixedLoaded
})

/** Each type-only form, by the module that uses it. */
const typeOnlyForms = {
  'src/forms/import-type.ts': `import type { Secret } from '../types.server'
export const importType = (value: Secret) => value.value
`,
  'src/forms/inline-type.ts': `import { type Secret } from '../types.server'
export const inlineType = (value: Secret) => value.value
`,
  'src/forms/export-type.ts': `export type { Secret } from '../types.server'
export const exportType = 1
`,
  'src/forms/export-type-star.ts': `export type * from '../types.server'
export const exportTypeStar = 1
`,
}

const app = {
  'src/types.server.ts': `;(globalThis as any).typesLoaded = 'MARK_TYPES_LOADED'
export type Secret = { value: string }
export const secret = (): Secret => ({ value: 'MARK_SECRET' })
`,
  'src/mixed.server.ts': `;(globalThis as any).mixedLoaded = 'MARK_MIXED_LOADED'
export type Mixed = { value: string }
export const mixed = (): Mixed => ({ value: 'MARK_MIXED' })
`,
  ...typeOnlyForms,
  'src/forms/mixed.ts': `import { type Mixed, mixed } from '../mixed.server'
export const readMixed = (): Mixed => mixed()
`,
  'src/entry.ts': `export * from './forms/import-type'
export * from './forms/inline-type'
export * from './forms/export-type'
export * from './forms/export-type-star'
import { readMixed } from './forms/mixed'
export { readMixed }
;(globalThis as any).readMixed = readMixed
`,
  // Start's router entry reaches the app's modules, as a router reaches its
  // routes.
  'src/router.ts': `import './entry'
export const getRouter = () => undefined
`,
}

/** What the client got, and the importers reported for the client. */
interface Outcome {
  /** `readMixed()`, described (`a safe mock`, or the value's text). */
  mixed: string
  typesLoaded: unknown
  mixedLoaded: unknown
  reported: Array<string>
}

const expected: Outcome = {
  mixed: 'a safe mock',
  typesLoaded: null,
  mixedLoaded: null,
  reported: ['src/forms/mixed.ts'],
}

/** A client script's view of the outcome (`describeValuePrelude`). */
const outcomeScript = (readMixed: string) => `${describeValuePrelude}
return {
  mixed: describeValue(${readMixed}(), 'MARK_'),
  typesLoaded: globalThis.typesLoaded ?? null,
  mixedLoaded: globalThis.mixedLoaded ?? null,
}`

describe.each(startBundlers)('%s build (mock mode)', (bundler) => {
  let built: Promise<StartBuild> | undefined
  let dispose: (() => Promise<void>) | undefined
  afterAll(() => dispose?.())

  test(
    'type-only forms are neither reported nor loaded; the mixed import is reported and mocked',
    async () => {
      built ??= buildStart({
        bundler,
        files: app,
        entry: 'src/entry.ts',
        start: { importProtection: { behavior: 'mock', mockAccess: 'off' } },
        registerCleanup: (cleanup) => {
          dispose = cleanup
        },
      })
      const build = await built
      const { result } = await build.client.run(
        outcomeScript('entry.readMixed'),
      )
      expect({
        ...(result as Omit<Outcome, 'reported'>),
        // (what the build reported, on every channel)
        reported: reportedImporters(build, 'client', app),
      }).toEqual(expected)
    },
    timeout,
  )
})

describe('vite dev', () => {
  test(
    'type-only forms are neither reported nor loaded; the mixed import is reported and mocked',
    async () => {
      const server = await startDevServer({
        browser: true,
        start: {},
        files: app,
      })
      const { result } = await runViteClient(
        server,
        '/src/router.ts',
        outcomeScript('globalThis.readMixed'),
      )
      await server.idle()
      expect({
        ...(result as Omit<Outcome, 'reported'>),
        reported: reportedImporters(server.logs, 'client', app),
      }).toEqual(expected)
    },
    timeout,
  )
})

describe('rsbuild dev', () => {
  test(
    'type-only forms are neither reported nor loaded; the mixed import is reported and mocked',
    async () => {
      const server = await startRsbuildStartDevServer({
        compileTimeout,
        browser: true,
        hmr: false,
        files: app,
      })
      // Nothing fails, on any channel
      expect(
        findDiagnostics(server.diagnostics, { severity: 'error' }),
      ).toEqual([])
      const { result } = await captureConsole(() =>
        runInClient(server, outcomeScript('globalThis.readMixed')),
      )
      expect({
        ...(result as { result: Omit<Outcome, 'reported'> }).result,
        reported: reportedImporters(
          findDiagnostics(server.diagnostics, { severity: 'warning' }),
          'client',
          app,
        ),
      }).toEqual(expected)
    },
    timeout,
  )
})

/**
 * A mixed import whose value only a server fn handler uses, in an app with
 * `verbatimModuleSyntax` (TypeScript then keeps an import left with type
 * specifiers only, as a side-effect import): once the compiler removes the
 * handler from the client, the import carries only a type, so it is no edge
 * (SPEC J6.2, J6.4, J4.12; DECISIONS L3): the client neither loads the
 * denied file nor reports it.
 */
const verbatimApp = {
  'tsconfig.json': JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      jsx: 'react-jsx',
      verbatimModuleSyntax: true,
    },
    include: ['src'],
  }),
  'src/types.server.ts': app['src/types.server.ts'],
  'src/forms/handler-only.ts': `import { createServerFn } from '@tanstack/react-start'
import { type Secret, secret } from '../types.server'
export const fetchSecret = createServerFn().handler(
  async (): Promise<Secret> => secret(),
)
`,
  'src/entry.ts': `export { fetchSecret } from './forms/handler-only'\n`,
  'src/router.ts': `import './entry'
export const getRouter = () => undefined
`,
}

const handlerOnly = { typesLoaded: null, reported: [] }

describe.each(startBundlers)(
  '%s build (mock mode), verbatimModuleSyntax',
  (bundler) => {
    test(
      'a mixed import whose value only a server fn handler uses is neither reported nor loaded',
      async () => {
        const build = await buildStart({
          bundler,
          files: verbatimApp,
          entry: 'src/entry.ts',
          start: { importProtection: { behavior: 'mock', mockAccess: 'off' } },
        })
        const { result } = await build.client.run(
          `return globalThis.typesLoaded ?? null`,
        )
        expect({
          typesLoaded: result,
          reported: reportedImporters(build, 'client', verbatimApp),
        }).toEqual(handlerOnly)
      },
      timeout,
    )
  },
)

describe('vite dev, verbatimModuleSyntax', () => {
  test(
    'a mixed import whose value only a server fn handler uses is neither reported nor loaded',
    async () => {
      const server = await startDevServer({
        browser: true,
        start: {},
        files: verbatimApp,
      })
      const { result: typesLoaded } = await runViteClient(
        server,
        '/src/router.ts',
        'return globalThis.typesLoaded ?? null',
      )
      await server.idle()
      expect({
        typesLoaded,
        reported: reportedImporters(server.logs, 'client', verbatimApp),
      }).toEqual(handlerOnly)
    },
    timeout,
  )
})
