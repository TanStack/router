/**
 * A client entry's own server-only marker is a violation whatever its form
 * and whatever the host's TypeScript makes of it (SWC drops
 * `export {} from`); an import of type specifiers only that
 * `verbatimModuleSyntax` keeps is one in a module that keeps nothing else
 * (a module of types, one whose export is inlined), and next to an import
 * of the same file whose binding the build drops; and `export {} from` a
 * denied file evaluates it as a bare import does (SPEC J6.4). Each case
 * built with protection on and off (off: the initializer ships), Vite and
 * Rsbuild.
 */
import { problems } from '@tanstack/compiler-test-utils/diagnostic-channel'
import { describe, expect, test } from 'vitest'
import { StartBuildError, startBundlers } from '../../build-harness'
import { buildStart } from '../../build-start'
import { reportedViolations } from '../../importProtection/start-apps'
import { db, outcome } from './kept-importer-cases'
import type { KeptCase } from './kept-importer-cases'
import type { StartBundler } from '../../build-harness'

/** A module importing the denied file's type in one declaration and a value it never reads in another. */
const adapterWithTypeImport = `import { type User } from './db.server'
import { secret } from './db.server'
export const unused = (u: User) => secret + u.name
export const label = 'l'
`

const cases: Array<
  KeptCase & {
    on: Array<string> | null | Record<StartBundler, Array<string> | null>
    off?: Record<StartBundler, boolean>
  }
> = [
  {
    // (Oxc drops it whatever verbatimModuleSyntax says; SWC keeps
    // `export {} from`)
    name: 'a re-export of type names only kept by verbatimModuleSyntax in a module whose export is inlined',
    files: {
      ...db,
      'src/types.ts': `export { type User } from './db.server'\nexport const label = 'l'\n`,
      'src/entry.ts': `import { label } from './types'\nexport const read = () => label\n`,
    },
    verbatim: true,
    on: { vite: null, rsbuild: ['src/types.ts'] },
    off: { vite: false, rsbuild: true },
  },
  {
    name: 'a client entry marked by `export {} from` the server-only marker',
    files: {
      'src/client.ts': `export {} from '@tanstack/react-start/server-only'
;(globalThis as Record<string, unknown>).connected = 'MARK_DB'
`,
      'src/entry.ts': `export const read = () => 'entry'\n`,
    },
    on: ['src/client.ts'],
  },
  {
    name: 'an import of type specifiers only kept by verbatimModuleSyntax in a module of types',
    files: {
      ...db,
      'src/types.ts': `import { type User } from './db.server'\nexport type Name = User['name']\n`,
      'src/entry.ts': `import { type Name } from './types'\nexport const read = (n?: Name) => n ?? 'client'\n`,
    },
    verbatim: true,
    on: ['src/types.ts'],
  },
  {
    name: 'an import of type specifiers only kept by verbatimModuleSyntax in a module whose export is inlined',
    files: {
      ...db,
      'src/types.ts': `import { type User } from './db.server'\nexport type Name = User['name']\nexport const k = 1\n`,
      'src/entry.ts': `import { k } from './types'\nexport const read = () => k\n`,
    },
    verbatim: true,
    on: ['src/types.ts'],
  },
  {
    name: 'an import of type specifiers only kept by verbatimModuleSyntax, next to an import of the same file read only in an unused function',
    files: {
      ...db,
      'src/adapter.ts': `import { type User } from './db.server'
import { secret } from './db.server'
export const unused = (u: User) => secret + u.name
export const label = 'l'
`,
      'src/entry.ts': `import { label } from './adapter'\nexport const read = () => label\n`,
    },
    verbatim: true,
    on: ['src/adapter.ts'],
  },
  {
    name: 'an import of type specifiers only, next to an import of the same file read only in an unused function, without verbatimModuleSyntax',
    files: {
      ...db,
      'src/adapter.ts': adapterWithTypeImport,
      'src/entry.ts': `import { label } from './adapter'\nexport const read = () => label\n`,
    },
    on: ['src/adapter.ts'],
  },
  {
    name: 'an empty re-export of a denied file in a JavaScript module that runs',
    files: {
      ...db,
      'src/adapter.js': `export {} from './db.server'\nexport const label = 'l'\n`,
      'src/entry.ts': `import { label } from './adapter.js'\nexport const read = () => label\n`,
    },
    on: ['src/adapter.js'],
  },
]

describe.each(startBundlers)('%s build', (bundler) => {
  test.each(cases)('$name: protection on and off', async (c) => {
    expect({
      on: await outcome(bundler, c, true),
      off: await outcome(bundler, c, false),
    }).toEqual({
      on: {
        failedAt: c.on === null || Array.isArray(c.on) ? c.on : c.on[bundler],
        shipped: false,
      },
      off: { failedAt: null, shipped: c.off?.[bundler] ?? true },
    })
  })
})

/** The client error of a build that must fail: its text and the reported importers (with their positions). */
async function failure(
  bundler: StartBundler,
  files: Record<string, string>,
  verbatim = false,
): Promise<{ text: string; importers: Array<string> }> {
  const error = await buildStart({
    bundler,
    files: {
      ...db,
      'src/entry.ts': `import { label } from './adapter'\nexport const read = () => label\n`,
      ...files,
      ...(verbatim && {
        'tsconfig.json': JSON.stringify({
          compilerOptions: { verbatimModuleSyntax: true },
        }),
      }),
    },
    entry: 'src/entry.ts',
    start: { importProtection: { behavior: 'error' } },
    ...(bundler === 'rsbuild' &&
      verbatim && {
        rsbuildConfig: {
          tools: {
            swc: { jsc: { transform: { verbatimModuleSyntax: true } } },
          },
        },
      }),
  }).then(
    () => null,
    (e: unknown) => e,
  )
  if (!(error instanceof StartBuildError)) {
    throw new Error(`expected the ${bundler} build to fail`)
  }
  return {
    text: problems(error.diagnostics)
      .filter(({ severity }) => severity === 'error')
      .map(({ text }) => text)
      .join('\n'),
    importers: reportedViolations(error)
      .filter((v) => v.environment === 'client')
      .map((v) => v.importer),
  }
}

describe.each(startBundlers)('%s build, the advice', (bundler) => {
  test('an import of type specifiers next to a value import of the same file suggests `import type`', async () => {
    const { text } = await failure(bundler, {
      'src/adapter.ts': adapterWithTypeImport,
    })
    expect(text).toContain("write it as `import type { … } from './db.server'`")
  })
})

// (Vite: SWC drops a TypeScript `export {} from`, so Rsbuild builds)
test('vite build: an empty re-export with a comment inside its braces suggests no `export type`', async () => {
  const { text } = await failure('vite', {
    'src/adapter.ts': `export { /* nothing */ } from './db.server'\nexport const label = 'l'\n`,
  })
  expect(text).toContain('Denied by file pattern')
  expect(text).not.toContain('export type')
})

test('rsbuild build: a re-export of type names only kept by verbatimModuleSyntax is reported at its statement', async () => {
  const { importers } = await failure(
    'rsbuild',
    {
      'src/adapter.ts': `export const label = 'l'\nexport { type User } from './db.server'\n`,
    },
    true,
  )
  expect(importers).toEqual([expect.stringMatching(/^src\/adapter\.ts:2:\d+$/)])
})
