/**
 * A Vite plugin's virtual module (`virtual:…`) in a build. The compiler reads
 * such a module's text through the bundler, and the compile of a module may
 * ask for that text while the module is being transformed: the build must
 * finish or fail, whatever the virtual modules import (SPEC G5). A marked one
 * is denied at its importer, as a marked file is.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { expectDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import { StartBuildError, buildStart } from '../build-harness'
import type { Plugin } from 'vite'

const timeout = 30_000

const virtualModules = (modules: Record<string, string>): Plugin => ({
  name: 'test:virtual-modules',
  resolveId(id) {
    return id in modules ? id : null
  },
  load(id) {
    return modules[id] ?? null
  },
})

const build = (entry: string, modules: Record<string, string>) =>
  buildStart({
    bundler: 'vite',
    files: { 'src/entry.ts': entry },
    entry: 'src/entry.ts',
    viteConfig: { plugins: [virtualModules(modules)] },
  })

const marked = `import '@tanstack/react-start/server-only'
export const secret = () => 'MARK_SERVER_SECRET'
`

describe.each(['virtual:app', 'virtual:app.ts'])('%s', (id) => {
  const other = id.replace('app', 'other')

  test(
    'a marked module is denied at its importer',
    async () => {
      const error = await build(
        `import { secret } from '${id}'\nexport const value = () => secret()\n`,
        { [id]: marked },
      ).then(
        () => expect.fail('the build must refuse the marked module'),
        (e: unknown) => e,
      )
      if (!(error instanceof StartBuildError)) {
        throw error
      }
      expectDiagnostic(error.diagnostics, {
        severity: 'error',
        file: 'src/entry.ts',
        root: error.root,
      })
    },
    timeout,
  )

  test(
    'a marked module only an unread bare import reaches finishes the build',
    async () => {
      const b = await build(`import '${id}'\nexport const value = 1\n`, {
        [id]: marked,
      })
      expect(b.client.where('MARK_SERVER_SECRET')).toBe('nowhere')
    },
    timeout,
  )

  test(
    'virtual modules importing each other build',
    async () => {
      const b = await build(
        `import { a } from '${id}'\nexport const value = () => a()\nconsole.log('MARK_ENTRY', value)\n`,
        {
          [id]: `import { b } from '${other}'\nexport const a = () => b\n`,
          [other]: `import { a } from '${id}'\nexport const b = () => ['MARK_OTHER', a]\n`,
        },
      )
      expect(b.client.where('MARK_OTHER')).not.toBe('nowhere')
    },
    timeout,
  )

  test(
    're-exports in a cycle of virtual modules finish the build without the handler in the client',
    async () => {
      const handlerInClient = await build(
        `import { base } from '${id}'
export const fn = base.handler(async () => 'MARK_SERVER_HANDLER')
console.log(fn)
`,
        {
          [id]: `export * from '${other}'\n`,
          [other]: `import { createServerFn } from '@tanstack/react-start'
export * from '${id}'
export const base = createServerFn()
`,
        },
      ).then(
        (b) => b.client.where('MARK_SERVER_HANDLER'),
        (e: unknown) => {
          // (a builder in a module without an extension is refused)
          if (!(e instanceof StartBuildError)) {
            throw e
          }
          return 'nowhere'
        },
      )
      expect(handlerInClient).toBe('nowhere')
    },
    timeout,
  )
})

test(
  'a virtual id only a plugin answers with its query builds',
  async () => {
    const b = await build(
      `import data from 'virtual:data?inline'\nconsole.log(data)\nexport const value = 1\n`,
      { 'virtual:data?inline': `export default 'MARK_DATA'\n` },
    )
    expect(b.client.where('MARK_DATA')).not.toBe('nowhere')
  },
  timeout,
)

test(
  'a rebuild reads again a virtual module a plugin answers from a watched file',
  async () => {
    const text = (root: string) => readFileSync(`${root}/data.txt`, 'utf8')
    const { client } = await buildStart({
      bundler: 'vite',
      files: {
        'data.txt': `export const base = { handler: (f: any) => f }\n`,
        'client-entry.ts': `import { base } from 'virtual:base.ts'
export const fn = base.handler(async () => 'MARK_SERVER_HANDLER')
console.log(fn)
`,
        'ssr-entry.ts': `export { fn } from './client-entry'\n`,
      },
      entry: { client: 'client-entry.ts', ssr: 'ssr-entry.ts' },
      watchEdits: {
        'data.txt': `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn()
`,
      },
      viteConfig: {
        plugins: [
          {
            name: 'test:virtual-from-file',
            resolveId: (id) => (id === 'virtual:base.ts' ? id : null),
            load(id) {
              if (id !== 'virtual:base.ts') {
                return null
              }
              const { root } = this.environment.config
              this.addWatchFile(`${root}/data.txt`)
              return text(root)
            },
          },
        ],
      },
    })
    expect(client.where('MARK_SERVER_HANDLER')).toBe('nowhere')
  },
  timeout,
)

test(
  'a virtual module whose load fails fails the build',
  async () => {
    await expect(
      buildStart({
        bundler: 'vite',
        files: {
          'src/entry.ts': `import { a } from 'virtual:broken'\nexport const value = () => a\n`,
        },
        entry: 'src/entry.ts',
        viteConfig: {
          plugins: [
            {
              name: 'test:broken',
              resolveId: (id) => (id === 'virtual:broken' ? id : null),
              load(id) {
                if (id === 'virtual:broken') {
                  throw new Error('MARK_LOAD_FAILED')
                }
                return null
              },
            },
          ],
        },
      }),
    ).rejects.toBeInstanceOf(StartBuildError)
  },
  timeout,
)
