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
import { evaluateServed } from '@tanstack/compiler-test-utils/dev-server'
import { captureConsole } from '@tanstack/compiler-test-utils/diagnostics'
import { afterAll, afterEach, describe, expect, test } from 'vitest'
import { buildStart, startBundlers } from '../../build-harness'
import { servedStartRuntime, startDevServer } from '../../dev-server'
import {
  describeValue,
  describeValuePrelude,
} from '../../importProtection/mock-helpers'
import {
  runInClient,
  startRsbuildStartDevServer,
} from '../../rsbuild-dev-server'
import { reportedImporters, rsbuildDevLog } from './v2-hosts'
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
      const { client } = await built
      const { result } = await client.run(outcomeScript('entry.readMixed'))
      expect({
        ...(result as Omit<Outcome, 'reported'>),
        reported: reportedImporters(client.warnings, 'client'),
      }).toEqual(expected)
    },
    timeout,
  )
})

describe('vite dev', () => {
  test(
    'type-only forms are neither reported nor loaded; the mixed import is reported and mocked',
    async () => {
      const server = await startDevServer({ start: {}, files: app })
      const { result } = await captureConsole(async () => {
        // The client loads the app from Start's router entry.
        await evaluateServed(server, '/src/router.ts')
        const { readMixed } = globalThis as unknown as {
          readMixed: () => unknown
        }
        return {
          mixed: describeValue(readMixed(), 'MARK_'),
          typesLoaded:
            (globalThis as Record<string, unknown>).typesLoaded ?? null,
          mixedLoaded:
            (globalThis as Record<string, unknown>).mixedLoaded ?? null,
        }
      })
      await server.idle()
      expect({
        ...result,
        reported: reportedImporters(server.logs, 'client'),
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
        files: app,
        start: { importProtection: rsbuildDevLog },
      })
      expect(server.errors).toEqual([])
      const { result } = await captureConsole(() =>
        runInClient(server, outcomeScript('globalThis.readMixed')),
      )
      expect({
        ...(result as { result: Omit<Outcome, 'reported'> }).result,
        reported: reportedImporters(server.warnings, 'client'),
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
        const { client } = await buildStart({
          bundler,
          files: verbatimApp,
          entry: 'src/entry.ts',
          start: { importProtection: { behavior: 'mock', mockAccess: 'off' } },
        })
        const { result } = await client.run(
          `return globalThis.typesLoaded ?? null`,
        )
        expect({
          typesLoaded: result,
          reported: reportedImporters(client.warnings, 'client'),
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
      const server = await startDevServer({ start: {}, files: verbatimApp })
      await evaluateServed(server, '/src/router.ts', {
        stubs: servedStartRuntime,
      })
      await server.idle()
      expect({
        typesLoaded:
          (globalThis as Record<string, unknown>).typesLoaded ?? null,
        reported: reportedImporters(server.logs, 'client'),
      }).toEqual(handlerOnly)
    },
    timeout,
  )
})
