/**
 * The bundler witnesses whether a value import used only as a type is an
 * edge (SPEC J6.2, J6.4): TypeScript erases it unless
 * `verbatimModuleSyntax` holds for the importer *as the bundler's own
 * TypeScript transform resolves it*: Vite's oxc reads the nearest tsconfig,
 * through `references` (a solution-style root, the stock Vite template) and
 * `extends`, unless `oxc.typescript.onlyRemoveTypeImports` overrides it;
 * Rsbuild's SWC never reads tsconfig (`tools.swc` decides). Import
 * protection reports exactly what each bundler keeps, and the client never
 * loads the denied file either way. Client environment, mock mode, Vite and
 * Rsbuild, builds and dev servers.
 */
import {
  captureConsole,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { afterEach, describe, expect, test } from 'vitest'
import { buildStart } from '../../build-harness'
import {
  rejection,
  startProtectedDevServer,
  violationRecorder,
} from '../../importProtection/start-apps'
import {
  runInClient,
  runViteClient,
  startBrowserStartDevServer as startDevServer,
  startBrowserRsbuildStartDevServer as startRsbuildStartDevServer,
} from './client-pages'
import { importersIn } from './v2-hosts'
import type { InlineConfig } from 'vite'
import type { RsbuildConfig } from '@rsbuild/core'

const timeout = 60_000
const compileTimeout = timeout

afterEach(() => {
  delete (globalThis as Record<string, unknown>).typesLoaded
})

const typesServer = `;(globalThis as any).typesLoaded = 'MARK_TYPES_LOADED'
export type Secret = { value: string }
export const secret = (): Secret => ({ value: 'MARK_SECRET' })
`
const typePosition = (target: string) => `import { secret } from '${target}'
export const typePosition = (value: typeof secret) => value
`
const base = {
  target: 'ES2022',
  module: 'ESNext',
  moduleResolution: 'Bundler',
  jsx: 'react-jsx',
}
const entryFiles = (importer: string) => ({
  'src/entry.ts': `export { typePosition } from './${importer}'\n`,
  'src/router.ts': `import './entry'
export const getRouter = () => undefined
`,
})

interface Layout {
  name: string
  files: Record<string, string>
  importer: string
  /** Whether oxc (Vite) keeps the import for this layout. */
  oxcKeeps: boolean
}

/** The research's five layouts (research-tsconfig-ip.md §A), each with the importer as `src/…`. */
const layouts: Array<Layout> = [
  {
    name: 'solution-style root (stock Vite template): tsconfig.app.json has verbatimModuleSyntax',
    importer: 'src/forms/type-position.ts',
    oxcKeeps: true,
    files: {
      'tsconfig.json': JSON.stringify({
        files: [],
        references: [
          { path: './tsconfig.app.json' },
          { path: './tsconfig.node.json' },
        ],
      }),
      'tsconfig.app.json': `{ "compilerOptions": { ${JSON.stringify(base).slice(1, -1)}, "verbatimModuleSyntax": true, /* comment */ }, "include": ["src"] }`,
      'tsconfig.node.json': JSON.stringify({
        compilerOptions: { verbatimModuleSyntax: false },
        include: ['vite.config.ts'],
      }),
    },
  },
  {
    name: 'extends a base with verbatimModuleSyntax',
    importer: 'src/forms/type-position.ts',
    oxcKeeps: true,
    files: {
      'tsconfig.base.json': JSON.stringify({
        compilerOptions: { ...base, verbatimModuleSyntax: true },
      }),
      'tsconfig.json': JSON.stringify({
        extends: './tsconfig.base.json',
        include: ['src'],
      }),
    },
  },
  {
    name: 'no verbatimModuleSyntax',
    importer: 'src/forms/type-position.ts',
    oxcKeeps: false,
    files: {
      'tsconfig.json': JSON.stringify({
        compilerOptions: base,
        include: ['src'],
      }),
    },
  },
  {
    name: 'monorepo: the nearest tsconfig (src/pkg) says true, the root false',
    importer: 'src/pkg/type-position.ts',
    oxcKeeps: true,
    files: {
      'tsconfig.json': JSON.stringify({
        compilerOptions: { ...base, verbatimModuleSyntax: false },
        include: ['src'],
      }),
      'src/pkg/tsconfig.json': JSON.stringify({
        extends: '../../tsconfig.json',
        compilerOptions: { verbatimModuleSyntax: true },
        include: ['.'],
      }),
    },
  },
  {
    name: 'monorepo: a directory without its own tsconfig, the root false',
    importer: 'src/forms/type-position.ts',
    oxcKeeps: false,
    files: {
      'tsconfig.json': JSON.stringify({
        compilerOptions: { ...base, verbatimModuleSyntax: false },
        include: ['src'],
      }),
      'src/pkg/tsconfig.json': JSON.stringify({
        extends: '../../tsconfig.json',
        compilerOptions: { verbatimModuleSyntax: true },
        include: ['.'],
      }),
    },
  },
]

function appOf(layout: Layout): Record<string, string> {
  const depth = layout.importer.split('/').length - 2
  const target = `${'../'.repeat(depth)}types.server`
  return {
    ...layout.files,
    'src/types.server.ts': typesServer,
    [layout.importer]: typePosition(target),
    ...entryFiles(layout.importer.slice('src/'.length).replace(/\.ts$/, '')),
  }
}

/** The client never loads the denied file; `reported` iff the bundler kept the import. */
const expected = (layout: Layout, kept: boolean) => ({
  typesLoaded: null,
  reported: kept ? [layout.importer] : [],
})

async function viteBuild(
  files: Record<string, string>,
  viteConfig?: InlineConfig,
) {
  const build = await buildStart({
    bundler: 'vite',
    files,
    entry: 'src/entry.ts',
    start: { importProtection: { behavior: 'mock', mockAccess: 'off' } },
    viteConfig,
  })
  const { result } = await build.client.run(
    `return globalThis.typesLoaded ?? null`,
  )
  return { typesLoaded: result, reported: importersIn(build, 'client') }
}

async function rsbuildBuild(
  files: Record<string, string>,
  rsbuildConfig?: RsbuildConfig,
) {
  const build = await buildStart({
    bundler: 'rsbuild',
    files,
    entry: 'src/entry.ts',
    start: { importProtection: { behavior: 'mock', mockAccess: 'off' } },
    rsbuildConfig,
  })
  const { result } = await build.client.run(
    `return globalThis.typesLoaded ?? null`,
  )
  return { typesLoaded: result, reported: importersIn(build, 'client') }
}

async function viteDev(
  files: Record<string, string>,
  config?: InlineConfig,
  importProtection?: Parameters<typeof violationRecorder>[0],
) {
  const recorder = violationRecorder(importProtection)
  const server = await startDevServer({
    browser: true,
    start: { importProtection: recorder.importProtection },
    files,
    config,
  })
  const { result: typesLoaded } = await runViteClient(
    server,
    '/src/router.ts',
    'return globalThis.typesLoaded ?? null',
  )
  await server.idle()
  return {
    typesLoaded,
    reported: importersIn({ root: server.root, ...recorder }, 'client'),
  }
}

async function rsbuildDev(
  files: Record<string, string>,
  config?: RsbuildConfig,
  importProtection?: Parameters<typeof violationRecorder>[0],
) {
  const recorder = violationRecorder(importProtection)
  const server = await startRsbuildStartDevServer({
    compileTimeout,
    browser: true,
    hmr: false,
    files,
    config,
    start: { importProtection: recorder.importProtection },
  })
  expect(findDiagnostics(server.diagnostics, { severity: 'error' })).toEqual([])
  const { result } = await captureConsole(() =>
    runInClient(server, 'return globalThis.typesLoaded ?? null'),
  )
  return {
    typesLoaded: (result as { result: unknown }).result,
    reported: importersIn({ root: server.root, ...recorder }, 'client'),
  }
}

describe.each(layouts)('tsconfig layout: $name', (layout) => {
  const files = appOf(layout)
  test(
    'vite build: reported iff oxc keeps the import',
    async () => {
      expect(await viteBuild(files)).toEqual(expected(layout, layout.oxcKeeps))
    },
    timeout,
  )
  test(
    'vite dev: reported iff oxc keeps the import',
    async () => {
      expect(await viteDev(files)).toEqual(expected(layout, layout.oxcKeeps))
    },
    timeout,
  )
  test(
    'rsbuild build: SWC never reads tsconfig, the import is erased',
    async () => {
      expect(await rsbuildBuild(files)).toEqual(expected(layout, false))
    },
    timeout,
  )
  test(
    'rsbuild dev: SWC never reads tsconfig, the import is erased',
    async () => {
      expect(await rsbuildDev(files)).toEqual(expected(layout, false))
    },
    timeout,
  )
})

describe('the transformer option wins over tsconfig', () => {
  const solution = layouts[0]!
  const off = layouts[2]!
  const oxcErases: InlineConfig = {
    oxc: { typescript: { onlyRemoveTypeImports: false } },
  }
  const swcKeeps: RsbuildConfig = {
    tools: { swc: { jsc: { transform: { verbatimModuleSyntax: true } } } },
  }
  test(
    'vite build, oxc onlyRemoveTypeImports: false erases despite the solution-style verbatimModuleSyntax',
    async () => {
      expect(await viteBuild(appOf(solution), oxcErases)).toEqual(
        expected(solution, false),
      )
    },
    timeout,
  )
  test(
    'vite dev, oxc onlyRemoveTypeImports: false erases despite the solution-style verbatimModuleSyntax',
    async () => {
      expect(await viteDev(appOf(solution), oxcErases)).toEqual(
        expected(solution, false),
      )
    },
    timeout,
  )
  test(
    'rsbuild build, tools.swc verbatimModuleSyntax keeps the import without any tsconfig setting',
    async () => {
      expect(await rsbuildBuild(appOf(off), swcKeeps)).toEqual(
        expected(off, true),
      )
    },
    timeout,
  )
  test(
    'rsbuild dev, tools.swc verbatimModuleSyntax keeps the import without any tsconfig setting',
    async () => {
      expect(await rsbuildDev(appOf(off), swcKeeps)).toEqual(
        expected(off, true),
      )
    },
    timeout,
  )
})

describe('behavior "error" in dev', () => {
  const solution = layouts[0]!
  // A failing import keeps failing: the importer is not cached, and the
  // next request asks the bundler for the edge module again.
  test(
    'vite dev: an import oxc keeps fails to load on every request',
    async () => {
      const server = await startProtectedDevServer(
        appOf(solution),
        { behavior: 'error' },
        { router: 'src/router.ts' },
      )
      await rejection(server.load('/src/router.ts'))
      await rejection(server.load('/src/router.ts'))
    },
    timeout,
  )
})

describe('onViolation returning false in dev', () => {
  const solution = layouts[0]!
  const off = layouts[2]!
  const swcKeeps: RsbuildConfig = {
    tools: { swc: { jsc: { transform: { verbatimModuleSyntax: true } } } },
  }
  const allow = { onViolation: () => false as const }
  test(
    'vite dev: the import oxc keeps gets the real module',
    async () => {
      expect(
        (await viteDev(appOf(solution), undefined, allow)).typesLoaded,
      ).toBe('MARK_TYPES_LOADED')
    },
    timeout,
  )
  test(
    'rsbuild dev: the import SWC keeps gets the real module',
    async () => {
      expect((await rsbuildDev(appOf(off), swcKeeps, allow)).typesLoaded).toBe(
        'MARK_TYPES_LOADED',
      )
    },
    timeout,
  )
})
