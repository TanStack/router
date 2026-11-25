/**
 * Which imports the build's dropped-import warning (SPEC J6.4) is about: a
 * denied module the client graph imports, whose mocks were all dropped and
 * nothing of which shipped; once per denied module and build. An import of
 * type specifiers only is ignored (J6.2); a module an allowed import ships is
 * not "nothing shipped"; an unused import another plugin adds is warned of
 * like one the compiler reads (a package module's is not: not the app's to
 * change). Client builds,
 * Vite and Rsbuild.
 */
import { describe, expect, test } from 'vitest'
import { buildStart, startBundlers } from '../../build-harness'
import { reportedViolations } from '../../importProtection/start-apps'
import {
  barrelApp,
  effectful,
  timeout,
  warningsNaming,
} from './dropped-imports-apps'
import { lateImport } from './late-import'

describe.each(startBundlers)('%s build', (bundler) => {
  test(
    'an import of type specifiers only gets no warning',
    async () => {
      const build = await buildStart({
        bundler,
        files: {
          ...effectful,
          'src/lib/users.server.ts': `export interface User {\n  name: string\n}\nexport const listUsers = () => 'MARK_SECRET'\n`,
          'src/entry.ts': `import { type User } from './lib/users.server'\nexport const read = (u: User) => u.name\n`,
        },
        entry: 'src/entry.ts',
        start: { importProtection: { behavior: 'error' } },
      })
      expect(reportedViolations(build)).toEqual([])
      expect(warningsNaming(build, 'src/lib/users.server.ts')).toEqual([])
    },
    timeout,
  )

  test(
    'a value import used only as a type gets one warning, at the importer',
    async () => {
      const build = await buildStart({
        bundler,
        files: {
          'src/lib/users.server.ts': `export interface User {\n  name: string\n}\nexport const listUsers = () => 'MARK_SECRET'\n`,
          'src/entry.ts': `import { User } from './lib/users.server'\nexport const read = (u: User) => u.name\n`,
        },
        entry: 'src/entry.ts',
        start: { importProtection: { behavior: 'error' } },
      })
      expect(reportedViolations(build)).toEqual([])
      expect(warningsNaming(build, 'src/entry.ts')).toHaveLength(1)
    },
    timeout,
  )

  test(
    'a denied module an allowed import ships gets no warning for its dropped re-export',
    async () => {
      const build = await buildStart({
        bundler,
        files: {
          ...barrelApp(effectful),
          'src/entry.ts': `import { label } from './lib'
import { listUsers } from './lib/users.server'
export const read = () => [label(), listUsers()].join('|')
`,
        },
        entry: 'src/entry.ts',
        start: {
          importProtection: {
            behavior: 'error',
            allowImport: (info) => info.importer.endsWith('/src/entry.ts'),
          },
        },
      })
      expect(reportedViolations(build)).toEqual([])
      expect((await build.client.run(`return entry.read()`)).result).toBe(
        'client|MARK_SECRET',
      )
      expect(warningsNaming(build, 'src/lib/index.ts')).toEqual([])
    },
    timeout,
  )

  test(
    'an unused import of a denied file another plugin adds builds, with one warning naming the file',
    async () => {
      const build = await buildStart({
        bundler,
        files: {
          ...effectful,
          // (JavaScript: no TypeScript transform erases the unused import)
          'src/late.js': `export const late = () => 'late'\n`,
          'src/entry.ts': `import { late } from './late.js'\nexport const read = () => late()\n`,
        },
        entry: 'src/entry.ts',
        start: { importProtection: { behavior: 'error' } },
        ...lateImport(`import { listUsers } from './lib/users.server';\n`),
      })
      expect(reportedViolations(build)).toEqual([])
      expect(build.client.where('MARK_SECRET')).toBe('nowhere')
      expect(warningsNaming(build, 'src/lib/users.server.ts')).toHaveLength(1)
    },
    timeout,
  )

  test(
    'the importer the warning names does not depend on the order the importers are compiled in',
    async () => {
      const named = async (order: Array<string>) => {
        const build = await buildStart({
          bundler,
          files: {
            ...effectful,
            'src/lib/a.ts': `export { listUsers } from './users.server'\nexport const a = () => 'a'\n`,
            'src/lib/b.ts': `export { listUsers } from './users.server'\nexport const b = () => 'b'\n`,
            'src/entry.ts': `${order.map((m) => `import { ${m} } from './lib/${m}'`).join('\n')}
export const read = () => [a(), b()].join('|')
`,
          },
          entry: 'src/entry.ts',
          start: { importProtection: { behavior: 'error' } },
        })
        return ['src/lib/a.ts', 'src/lib/b.ts'].filter(
          (file) => warningsNaming(build, file).length > 0,
        )
      }
      expect(await named(['a', 'b'])).toEqual(['src/lib/a.ts'])
      expect(await named(['b', 'a'])).toEqual(['src/lib/a.ts'])
    },
    timeout,
  )
})

test(
  'vite build with two outputs: one warning for the dropped import',
  async () => {
    const build = await buildStart({
      bundler: 'vite',
      files: barrelApp(effectful),
      entry: 'src/entry.ts',
      start: { importProtection: { behavior: 'error' } },
      viteConfig: {
        environments: {
          client: {
            build: {
              rolldownOptions: {
                output: [
                  { entryFileNames: 'a/[name].js' },
                  { entryFileNames: 'b/[name].js' },
                ],
              },
            },
          },
        },
      },
    })
    expect(warningsNaming(build, 'src/lib/users.server.ts')).toHaveLength(1)
  },
  timeout,
)
