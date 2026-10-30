/**
 * The Start compiler on a running Rsbuild dev server: an edit rebuilds the
 * edited module and the modules compiled against facts the edit changed,
 * nothing else; files that appear, disappear or shadow a resolution reach
 * the modules that read them; a dev server started again on its persistent
 * cache compiles again what changed while it was down.
 */
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { startRsbuildStartDevServer } from '../../rsbuild-dev-server'

const timeout = 60_000
const compileTimeout = 20_000

/** The app modules (under `src/`) a server's compiles since the last edit built, sorted. */
const builtAppModules = (server: { rebuilt: Array<string> }) =>
  server.rebuilt.filter((file) => file.startsWith('src/')).sort()

/** A plain object with a `handler` method: no server fn builder. */
const plainBase = `export const base = {
  handler: (fn: () => Promise<string>) => fn,
}
`
/** A server fn builder under the same name. */
const builderBase = `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn()
`
/** A module defining `name` with `base.handler`, `base` imported from `from`. */
const handlerModule = (name: string, from: string) =>
  `import { base } from '${from}'
export const ${name} = base.handler(async () => 'MARK_${name.toUpperCase()}')
`

describe('Rsbuild dev: what an edit rebuilds', () => {
  // A module many modules import (a formatting helper) is edited without
  // changing anything its importers read of it: Rspack builds it again and
  // nothing else, in each environment (main builds 1 + 1 modules too).
  // Source: factcheck of review 1, part 3 (a comment-only edit of a helper
  // with 373 importers rebuilt 853 + 869 modules).
  test(
    'an edit that changes no fact of a widely imported module builds that module only',
    async () => {
      const importers = Array.from({ length: 12 }, (_, i) => `m${i}`)
      const format = `export const format = (n: number) => '#' + n\n`
      const server = await startRsbuildStartDevServer({
        compileTimeout,
        files: {
          'src/lib/format.ts': format,
          ...Object.fromEntries(
            importers.map((name, i) => [
              `src/${name}.ts`,
              `import { format } from './lib/format'
export const ${name} = () => format(${i})
`,
            ]),
          ),
          'src/entry.ts': `${importers.map((name) => `import { ${name} } from './${name}'`).join('\n')}
console.log(${importers.map((name) => `${name}()`).join(', ')})
`,
        },
      })
      expect(server.errors).toEqual([])
      await server.edit({ 'src/lib/format.ts': `${format}// a comment\n` })
      expect(server.errors).toEqual([])
      expect(builtAppModules(server)).toEqual([
        'src/lib/format.ts',
        'src/lib/format.ts',
      ])
    },
    timeout,
  )

  // An edit that makes an export a server fn builder: the modules that build
  // server fns on it are compiled again (the client loses their handlers),
  // and so is the entry, whose compile followed their values to it; the
  // modules that import something else are not.
  // Source: R87 (the core's invalidation decides which dependents are stale).
  test(
    'an edit that makes an export a server fn builder compiles its users again, and nothing unrelated',
    async () => {
      const server = await startRsbuildStartDevServer({
        compileTimeout,
        files: {
          'src/lib/base.ts': plainBase,
          'src/lib/other.ts': `export const other = (n: number) => n + 1\n`,
          'src/a1.ts': handlerModule('a1', './lib/base'),
          'src/a2.ts': handlerModule('a2', './lib/base'),
          'src/u1.ts': `import { other } from './lib/other'\nexport const u1 = () => other(1)\n`,
          'src/u2.ts': `import { other } from './lib/other'\nexport const u2 = () => other(2)\n`,
          'src/entry.ts': `import { a1 } from './a1'
import { a2 } from './a2'
import { u1 } from './u1'
import { u2 } from './u2'
console.log(a1, a2, u1(), u2())
`,
        },
      })
      const client = async () =>
        Object.values(await server.outputs('client')).join('\n')
      expect(server.errors).toEqual([])
      expect(await client()).toContain('MARK_A1')
      await server.edit({ 'src/lib/base.ts': builderBase })
      expect(server.errors).toEqual([])
      const output = await client()
      expect(output).not.toContain('MARK_A1')
      expect(output).not.toContain('MARK_A2')
      const built = builtAppModules(server)
      expect(built).toEqual(
        expect.arrayContaining(['src/a1.ts', 'src/a2.ts', 'src/lib/base.ts']),
      )
      expect(
        built.filter((file) =>
          /^src\/(u1|u2|lib\/other)\.ts$/.test(file),
        ),
      ).toEqual([])
    },
    timeout,
  )
})

describe('Rsbuild dev: files that appear and disappear', () => {
  // The builder module is deleted (its importer fails to compile), then
  // created again as a plain object: the importer is compiled against the
  // new file, and keeps its handler in the client.
  // Source: R87 (no file dependency of the importer on its import any more).
  test(
    'a dependency deleted and created again with other facts compiles its importer again',
    async () => {
      const server = await startRsbuildStartDevServer({
        compileTimeout,
        files: {
          'src/lib/base.ts': builderBase,
          'src/a.ts': handlerModule('a', './lib/base'),
          'src/entry.ts': `import { a } from './a'\nconsole.log(a)\n`,
        },
      })
      const client = async () =>
        Object.values(await server.outputs('client')).join('\n')
      expect(server.errors).toEqual([])
      expect(await client()).not.toContain('MARK_A')
      await server.edit({ 'src/lib/base.ts': null })
      expect(server.errors).not.toEqual([])
      await server.edit({ 'src/lib/base.ts': plainBase })
      expect(server.errors).toEqual([])
      expect(await client()).toContain('MARK_A')
    },
    timeout,
  )

  // `./lib` resolves to `src/lib/index.ts` (a plain object) until
  // `src/lib.ts` (a server fn builder) appears: the file comes first, so
  // the importer is compiled against it and its handler leaves the client.
  // Source: R87 (successful resolutions are kept across compiles; a created
  // file still invalidates the resolutions it shadows).
  test(
    'a created file that shadows a resolution compiles the importer again',
    async () => {
      const server = await startRsbuildStartDevServer({
        compileTimeout,
        files: {
          'src/lib/index.ts': plainBase,
          'src/a.ts': handlerModule('a', './lib'),
          'src/entry.ts': `import { a } from './a'\nconsole.log(a)\n`,
        },
      })
      const client = async () =>
        Object.values(await server.outputs('client')).join('\n')
      expect(server.errors).toEqual([])
      expect(await client()).toContain('MARK_A')
      await server.edit({ 'src/lib.ts': builderBase })
      expect(server.errors).toEqual([])
      expect(await client()).not.toContain('MARK_A')
    },
    timeout,
  )
})

describe('Rsbuild dev restarted on its persistent cache', () => {
  const app = {
    'src/lib/base.ts': plainBase,
    'src/a.ts': handlerModule('a', './lib/base'),
    'src/entry.ts': `import { a } from './a'\nconsole.log(a)\n`,
  }
  const config = { performance: { buildCache: true } }

  // Nothing changed meanwhile: the new server restores every app module
  // from the cache and compiles none.
  // Source: R87 (the plans' dependencies persist with the modules and are
  // checked at startup).
  test(
    'compiles no app module when nothing changed meanwhile',
    async () => {
      const first = await startRsbuildStartDevServer({
        compileTimeout,
        config,
        files: app,
      })
      expect(first.errors).toEqual([])
      const server = await first.restart()
      expect(server.errors).toEqual([])
      expect(builtAppModules(server)).toEqual([])
    },
    timeout,
  )

  // `base` became a server fn builder while the server was down: the
  // restored importer is compiled again and its handler leaves the client.
  // Source: R87; the build variant is start-build-env-separation.test.ts.
  test(
    'compiles again a module whose import became a server fn builder meanwhile',
    async () => {
      const first = await startRsbuildStartDevServer({
        compileTimeout,
        config,
        files: app,
      })
      const client = async (server: typeof first) =>
        Object.values(await server.outputs('client')).join('\n')
      expect(first.errors).toEqual([])
      expect(await client(first)).toContain('MARK_A')
      await first.stop()
      await writeFile(path.join(first.root, 'src/lib/base.ts'), builderBase)
      const server = await first.restart()
      expect(server.errors).toEqual([])
      expect(await client(server)).not.toContain('MARK_A')
    },
    timeout,
  )

  // Restored without a compile, the importer is still compiled again when
  // an edit of the new session changes what it read.
  // Source: R87 (the restored dependencies join the session's invalidation).
  test(
    'compiles again a restored module when an edit changes its import',
    async () => {
      const first = await startRsbuildStartDevServer({
        compileTimeout,
        config,
        files: app,
      })
      expect(first.errors).toEqual([])
      const server = await first.restart()
      const client = async () =>
        Object.values(await server.outputs('client')).join('\n')
      expect(server.errors).toEqual([])
      expect(await client()).toContain('MARK_A')
      await server.edit({ 'src/lib/base.ts': builderBase })
      expect(server.errors).toEqual([])
      expect(await client()).not.toContain('MARK_A')
    },
    timeout,
  )
})
