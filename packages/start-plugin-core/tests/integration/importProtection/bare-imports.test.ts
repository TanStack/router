/**
 * A bare import of a denied module (`import './x.server'`, `import {} from`;
 * `export {} from`: own-and-type-imports.test.ts) is a violation wherever the build keeps its importer
 * (SPEC J6.4), decided by the import as the bundler's own graph holds it:
 * whatever the compiler read of the importer (a package module it does not
 * compile, an import a later plugin added, an import that is bare only after
 * TypeScript) and whatever the tree-shaking settings. A surviving `import()`
 * evaluates its module whatever it reads; one in a dead branch is dropped.
 * Client builds, `behavior: 'error'`, Vite and Rsbuild.
 */
import { describe, expect, test } from 'vitest'
import { startBundlers } from '../../build-harness'
import { buildStart } from '../../build-start'
import {
  rejection,
  reportedViolations,
} from '../../importProtection/start-apps'
import { lateImport } from './late-import'
import type { StartBundler } from '../../build-harness'
import type { Plugin } from 'vite'
import type { RsbuildConfig } from '@rsbuild/core'

const db = {
  'src/db.server.ts': `;(globalThis as Record<string, unknown>).connected = 'MARK_DB'
export interface User {
  name: string
}
export const secret = 'MARK_SECRET'
`,
}

/** The client violations of a build that must fail, as `importer` (root-relative, position cut). */
async function failedAt(
  bundler: StartBundler,
  files: Record<string, string>,
  config: {
    viteConfig?: { plugins?: Array<Plugin> } & Record<string, unknown>
    rsbuildConfig?: RsbuildConfig
  } = {},
) {
  const error = await rejection(
    buildStart({
      bundler,
      files,
      entry: 'src/entry.ts',
      start: { importProtection: { behavior: 'error' } },
      ...(bundler === 'vite'
        ? { viteConfig: config.viteConfig }
        : { rsbuildConfig: config.rsbuildConfig }),
    }),
  )
  return reportedViolations(error)
    .filter((v) => v.environment === 'client')
    .map((v) => v.importer.replace(/:\d+(:\d+)?$/, ''))
}

describe.each(startBundlers)('%s build', (bundler) => {
  test('a package module the compiler does not compile importing a marked file bare fails the build at the package module', async () => {
    expect(
      await failedAt(bundler, {
        'node_modules/dep/package.json': JSON.stringify({
          name: 'dep',
          version: '1.0.0',
          type: 'module',
          main: 'index.js',
        }),
        'node_modules/dep/index.js': `import './marked.js'\nexport const x = 'dep'\n`,
        'node_modules/dep/marked.js': `import '@tanstack/react-start/server-only'\nexport const secret = 'MARK_SECRET'\n`,
        'src/entry.ts': `import { x } from 'dep'\nexport const read = () => x\n`,
      }),
    ).toEqual(['node_modules/dep/index.js'])
  })

  test('a bare import of a denied file another plugin adds fails the build at its importer', async () => {
    expect(
      await failedAt(
        bundler,
        {
          ...db,
          'src/late.ts': `export const late = () => 'late'\n`,
          'src/entry.ts': `import { late } from './late'\nexport const read = () => late()\n`,
        },
        lateImport(`import './db.server';\n`),
      ),
    ).toEqual(['src/late.ts'])
  })

  test('a surviving import() of a denied file that reads nothing of it fails the build', async () => {
    expect(
      await failedAt(bundler, {
        ...db,
        'src/entry.ts': `export const read = () => import('./db.server').then(() => 'loaded')\n`,
      }),
    ).toEqual(['src/entry.ts'])
  })

  test('an import() of a denied file in a branch the client build drops builds', async () => {
    const { client, violations } = await buildStart({
      bundler,
      files: {
        ...db,
        'src/entry.ts': `export const read = async () => {
  if (import.meta.env.SSR) {
    const m = await import('./db.server')
    return m.secret
  }
  return 'client'
}
`,
      },
      entry: 'src/entry.ts',
      start: { importProtection: { behavior: 'error' } },
    })
    expect(violations).toEqual([])
    expect((await client.run(`return entry.read()`)).result).toBe('client')
  })

  test('an import of type specifiers only that the TypeScript transform keeps (verbatimModuleSyntax) fails the build', async () => {
    expect(
      await failedAt(
        bundler,
        {
          ...db,
          'tsconfig.json': JSON.stringify({
            compilerOptions: { verbatimModuleSyntax: true },
          }),
          'src/entry.ts': `import { type User } from './db.server'\nexport const read = (u: User) => u.name\n`,
        },
        {
          rsbuildConfig: {
            tools: {
              swc: { jsc: { transform: { verbatimModuleSyntax: true } } },
            },
          },
        },
      ),
    ).toEqual(['src/entry.ts'])
  })

  test.each([
    { name: 'on: the client gets the mock, and it is reported', enabled: true },
    { name: 'off (control): the client runs the file', enabled: false },
  ])(
    'an import of type specifiers only that verbatimModuleSyntax keeps, protection $name',
    async ({ enabled }) => {
      const build = await buildStart({
        bundler,
        files: {
          ...db,
          'tsconfig.json': JSON.stringify({
            compilerOptions: { verbatimModuleSyntax: true },
          }),
          'src/entry.ts': `import { type User } from './db.server'
export const read = (u?: User) => u?.name ?? (globalThis as Record<string, unknown>).connected ?? 'none'
`,
        },
        entry: 'src/entry.ts',
        start: {
          importProtection: enabled
            ? { behavior: 'mock', mockAccess: 'off' }
            : { enabled: false },
        },
        ...(bundler === 'rsbuild' && {
          rsbuildConfig: {
            tools: {
              swc: { jsc: { transform: { verbatimModuleSyntax: true } } },
            },
          },
        }),
      })
      expect({
        read: (await build.client.run(`return entry.read()`)).result,
        reported: reportedViolations(build).map((v) =>
          v.importer.replace(/:\d+(:\d+)?$/, ''),
        ),
      }).toEqual(
        enabled
          ? { read: 'none', reported: ['src/entry.ts'] }
          : { read: 'MARK_DB', reported: [] },
      )
    },
  )
})

test('vite build: a bare import in the client entry fails the build with treeshake.moduleSideEffects false', async () => {
  expect(
    await failedAt(
      'vite',
      {
        ...db,
        'src/entry.ts': `import './db.server'\nexport const read = () => 'client'\n`,
      },
      {
        viteConfig: {
          environments: {
            client: {
              build: {
                rolldownOptions: { treeshake: { moduleSideEffects: false } },
              },
            },
          },
        },
      },
    ),
  ).toEqual(['src/entry.ts'])
})
