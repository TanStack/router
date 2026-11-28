/**
 * Type-only imports of a denied file through real hosts (SPEC
 * J6.2): `import type`, `import { type X }`, `export type { X } from`,
 * `export { type X } from` and `export type * from` of the denied file `src/types.server.ts` are no
 * violation: nothing is reported for their importers and the client never
 * loads the file (it records that it ran). A mixed `import { type X, value }`
 * of the denied file `src/mixed.server.ts` still uses a value: it is
 * reported, and the client gets a safe mock. Client environment, mock mode
 * (dev default; `behavior: 'mock'` in builds), Vite and Rsbuild, builds and
 * dev servers with Start's whole plugin.
 */
import {
  captureConsole,
  expectNoDiagnostic,
} from '@tanstack/compiler-test-utils/diagnostics'
import { describe, expect, test } from 'vitest'
import { closeAfterAll } from '../../file-end'
import { buildStartShared, startBundlers } from '../../build-harness'
import { buildStart } from '../../build-start'
import { describeValuePrelude } from '../../importProtection/mock-helpers'
import {
  problemsNaming,
  violationRecorder,
} from '../../importProtection/start-apps'
import {
  runInClient,
  runViteClient,
  startBrowserStartDevServer as startDevServer,
  startBrowserRsbuildStartDevServer as startRsbuildStartDevServer,
} from './client-pages'
import { importersIn } from './hosts'
import type { StartBuild } from '../../build-harness'

const timeout = 60_000
const compileTimeout = timeout

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
  // (C1-16, whole-PR review: a re-export whose specifiers are all type-only)
  'src/forms/export-inline-type.ts': `export { type Secret } from '../types.server'
export const exportInlineType = 1
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
export * from './forms/export-inline-type'
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
  const openBuilt = closeAfterAll()

  test(
    'type-only forms are neither reported nor loaded; the mixed import is reported and mocked',
    async () => {
      built ??= openBuilt(() =>
        buildStartShared({
          bundler,
          files: app,
          entry: 'src/entry.ts',
          start: { importProtection: { behavior: 'mock', mockAccess: 'off' } },
        }),
      )
      const build = await built
      const { result } = await build.client.run(
        outcomeScript('entry.readMixed'),
      )
      expect({
        ...(result as Omit<Outcome, 'reported'>),
        reported: importersIn(build, 'client'),
      }).toEqual(expected)
    },
    timeout,
  )
})

describe('vite dev', () => {
  test(
    'type-only forms are neither reported nor loaded; the mixed import is reported and mocked',
    async () => {
      const recorder = violationRecorder()
      const server = await startDevServer({
        browser: true,
        start: { importProtection: recorder.importProtection },
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
        reported: importersIn({ root: server.root, ...recorder }, 'client'),
      }).toEqual(expected)
    },
    timeout,
  )
})

describe('rsbuild dev', () => {
  test(
    'type-only forms are neither reported nor loaded; the mixed import is reported and mocked',
    async () => {
      const recorder = violationRecorder()
      const server = await startRsbuildStartDevServer({
        compileTimeout,
        browser: true,
        hmr: false,
        files: app,
        start: { importProtection: recorder.importProtection },
      })
      // Nothing fails, on any channel
      expectNoDiagnostic(server.diagnostics, { severity: 'error' })
      const { result } = await captureConsole(() =>
        runInClient(server, outcomeScript('globalThis.readMixed')),
      )
      expect({
        ...(result as { result: Omit<Outcome, 'reported'> }).result,
        reported: importersIn({ root: server.root, ...recorder }, 'client'),
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
 * (SPEC J6.2, J6.4, J4.12, J2.5): the client neither loads the
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
          reported: importersIn(build, 'client'),
        }).toEqual(handlerOnly)
      },
      timeout,
    )

    // Rsbuild's SWC under `verbatimModuleSyntax` keeps `export { type X }
    // from` as a bare `export {} from`: the denied file is a real import
    // there, which protection mocks; Vite's Oxc erases the statement. Either
    // way nothing of the file ships. (The effect-model lane's question to
    // the declarations lane.)
    test(
      'an all-type re-export of the denied file ships nothing of it',
      async () => {
        const build = await buildStart({
          bundler,
          files: {
            ...verbatimApp,
            'src/forms/reexport.ts': `export { type Secret } from '../types.server'
export const reexported = 1
`,
            'src/entry.ts': `export { reexported } from './forms/reexport'\n`,
          },
          entry: 'src/entry.ts',
          start: { importProtection: { behavior: 'mock', mockAccess: 'off' } },
          ...(bundler === 'rsbuild' && {
            rsbuildConfig: {
              tools: {
                swc: { jsc: { transform: { verbatimModuleSyntax: true } } },
              },
            },
          }),
        })
        const { result } = await build.client.run(
          `return [entry.reexported, globalThis.typesLoaded ?? null]`,
        )
        expect({
          result,
          shipped: build.client.where('MARK_TYPES_LOADED'),
        }).toEqual({ result: [1, null], shipped: 'nowhere' })
      },
      timeout,
    )
  },
)

/**
 * A re-export whose specifiers are all type-only (`export { type X } from`)
 * is TypeScript's, as `export type { X } from`: no edge, so a dev server
 * (the default `mock` mode, which warns about a violation; a build reports
 * after tree-shaking) reports nothing on any channel, and the client never
 * loads the denied file. (Whole-PR review of the declarations lane: the
 * import-protection edge of this form, handed over by the effect-model
 * lane.)
 */
const allTypeReexport = {
  'src/types.server.ts': `;(globalThis as any).typesLoaded = 'MARK_TYPES_LOADED'
export type Secret = { value: string }
export const secret = (): Secret => ({ value: 'MARK_SECRET' })
`,
  'src/forms/export-inline-type.ts': `export { type Secret } from '../types.server'
export const exportInlineType = 1
`,
  'src/entry.ts': `export * from './forms/export-inline-type'
;(globalThis as any).entryLoaded = true
`,
  'src/router.ts': `import './entry'
export const getRouter = () => undefined
`,
}
const allTypeFiles = ['src/forms/export-inline-type.ts', 'src/types.server.ts']
const allTypeExpected = {
  reported: [],
  problems: [],
  loaded: { entry: true, types: null },
}
const loadedScript = `return { entry: globalThis.entryLoaded ?? null, types: globalThis.typesLoaded ?? null }`

describe('an all-type re-export', () => {
  test(
    'vite dev: reports nothing and loads nothing of the denied file',
    async () => {
      const recorder = violationRecorder()
      const server = await startDevServer({
        start: { importProtection: recorder.importProtection },
        files: allTypeReexport,
      })
      const { result } = await runViteClient(
        server,
        '/src/router.ts',
        loadedScript,
      )
      await server.idle()
      expect({
        reported: importersIn({ root: server.root, ...recorder }, 'client'),
        problems: problemsNaming(server, allTypeFiles),
        loaded: result,
      }).toEqual(allTypeExpected)
    },
    timeout,
  )

  test(
    'rsbuild dev: reports nothing and loads nothing of the denied file',
    async () => {
      const recorder = violationRecorder()
      const server = await startRsbuildStartDevServer({
        compileTimeout,
        browser: true,
        hmr: false,
        files: allTypeReexport,
        start: { importProtection: recorder.importProtection },
      })
      const { result } = await captureConsole(() =>
        runInClient(server, loadedScript),
      )
      expect({
        reported: importersIn({ root: server.root, ...recorder }, 'client'),
        problems: problemsNaming(server, allTypeFiles),
        loaded: (result as { result: unknown }).result,
      }).toEqual(allTypeExpected)
    },
    timeout,
  )
})

describe('vite dev, verbatimModuleSyntax', () => {
  test(
    'a mixed import whose value only a server fn handler uses is neither reported nor loaded',
    async () => {
      const recorder = violationRecorder()
      const server = await startDevServer({
        browser: true,
        start: { importProtection: recorder.importProtection },
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
        reported: importersIn({ root: server.root, ...recorder }, 'client'),
      }).toEqual(handlerOnly)
    },
    timeout,
  )
})
