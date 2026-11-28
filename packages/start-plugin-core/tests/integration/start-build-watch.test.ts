/**
 * `vite build --watch` of a Start app: the rows every bundler runs
 * (`start-build-watch-cases.ts`), a virtual module, a module another plugin
 * compiles, and what Start relies on of Rolldown's watch mode. The client
 * build the server embeds: `start-build-watch-manifest.test.ts`.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import mdx from '@mdx-js/rollup'
import { describe, expect, test } from 'vitest'

import { buildStart } from '../build-start'

import { buildWatchSuite, files, timeout } from './start-build-watch-cases'
import type { Plugin } from 'vite'

buildWatchSuite('vite')

describe('vite build --watch: a virtual module', () => {
  // Source: Astra review round 2 (B1: a rebuild loaded the virtual module's
  // new text, and compiled its importer against the facts of the first).
  test(
    'an importer of a factory the virtual module stops exporting keeps its handler',
    async () => {
      const resolvedId = '\0virtual:kit'
      const kit: Plugin = {
        name: 'test:kit',
        resolveId: (source) =>
          source === 'virtual:kit' ? resolvedId : undefined,
        load(id) {
          if (id !== resolvedId) {
            return undefined
          }
          const file = path.join(this.environment.config.root, 'kit.txt')
          this.addWatchFile(file)
          return readFileSync(file, 'utf8') === 'factory'
            ? `import { createServerFn } from '@tanstack/react-start'
export const authed = createServerFn()
export const version = 1
`
            : `export const authed = { handler: (fn) => fn }
export const version = 2
`
        },
      }
      const { client } = await buildStart({
        bundler: 'vite',
        files: {
          'kit.txt': 'factory',
          'src/fns.ts': `import { authed } from 'virtual:kit'
export const getSecret = authed.handler(() => 'MARK_KIT')
`,
          'src/entry.ts': `export { getSecret } from './fns'
export { version } from 'virtual:kit'
`,
        },
        entry: 'src/entry.ts',
        viteConfig: { plugins: [kit] },
        watchEdits: { 'kit.txt': 'plain' },
      })
      expect(
        (await client.run(`return [entry.version, entry.getSecret()]`)).result,
      ).toEqual([2, 'MARK_KIT'])
    },
    timeout,
  )
})

describe('vite build --watch: a module another plugin compiles', () => {
  // `page.mdx` (`@mdx-js/rollup`, compiled by Start in place) imports a
  // server-only file: the client gets its mock, and its build imports no
  // `lib.ts`. An edit that stops marking `lib.ts` server-only rebuilds the
  // client with the file itself, as for a TypeScript importer (the row
  // above). Source: Astra round 3 (hosts B1: the late transform declared
  // no plan dependency to the watcher).
  test(
    'an MDX module gets the file an edit stops marking server-only',
    async () => {
      const { client } = await buildStart({
        bundler: 'vite',
        files: {
          'src/lib.ts': `import '@tanstack/react-start/server-only'
export const secret = () => 'MARK_LIB'
`,
          'src/page.mdx': `import { secret } from './lib'

export const read = () => secret()

# Page
`,
          'src/entry.ts': `export { read } from './page.mdx'
`,
        },
        entry: 'src/entry.ts',
        start: { importProtection: { behavior: 'mock' } },
        viteConfig: { plugins: [{ enforce: 'pre', ...mdx() }] },
        watchEdits: {
          'src/lib.ts': `export const secret = () => 'MARK_LIB'
`,
        },
      })
      expect((await client.run(`return entry.read()`)).result).toBe('MARK_LIB')
    },
    timeout,
  )
})

// What Start's watch builds rely on of Rolldown's watch mode, which its
// documentation does not promise (assumption tests). Each fails when
// Rolldown changes it.
describe('vite build --watch: assumption tests', () => {
  // Rolldown's watch rebuild is a whole build: every module's `load` and
  // `transform` run again. Start and the router take a watch build's stale
  // set at its start (and Start embeds the client build afresh in each
  // server build) on that ground. With incremental rebuilds, a module stale
  // only through a dependency would keep its old output.
  test(
    'a rebuild transforms every module of the first build again',
    async () => {
      /** Per environment, the app modules each build transformed. */
      const builds: Record<string, Array<Set<string>>> = { client: [], ssr: [] }
      const record: Plugin = {
        name: 'test:transforms',
        buildStart() {
          builds[this.environment.name]?.push(new Set())
        },
        transform(_code, id) {
          if (!id.includes('/node_modules/')) {
            builds[this.environment.name]?.at(-1)?.add(id)
          }
          return null
        },
      }
      await buildStart({
        bundler: 'vite',
        files,
        entry: { client: 'client-entry.ts', ssr: 'ssr-entry.ts' },
        viteConfig: { plugins: [record] },
        watchEdits: { 'greeting.ts': `export const greeting = 'MARK_AFTER'\n` },
      })
      for (const env of ['client', 'ssr']) {
        const [first, ...rebuilds] = builds[env]!
        expect(first!.size).toBeGreaterThan(0)
        expect(rebuilds.length).toBeGreaterThan(0)
        for (const rebuild of rebuilds) {
          expect([...first!].filter((id) => !rebuild.has(id))).toEqual([])
        }
      }
    },
    timeout,
  )

  // A plugin context kept from an environment's finished build still
  // resolves: a file event's invalidation asks a plan's resolutions with its
  // environment's resolver of its last build (`Session.resolvers`).
  test(
    "a plugin context's resolve still answers after its build ended",
    async () => {
      let resolve:
        | ((source: string, importer: string) => Promise<{ id: string } | null>)
        | undefined
      let answer: string | null | undefined
      const keep: Plugin = {
        name: 'test:kept-resolver',
        buildStart() {
          if (this.environment.name === 'ssr' && !resolve) {
            resolve = (source, importer) => this.resolve(source, importer)
          }
        },
        async watchChange(id) {
          if (this.environment.name === 'ssr' && id.endsWith('greeting.ts')) {
            const importer = id.replace(/greeting\.ts$/, 'fns.ts')
            answer = (await resolve!('./greeting', importer))?.id ?? null
          }
        },
      }
      const build = await buildStart({
        bundler: 'vite',
        files,
        entry: { client: 'client-entry.ts', ssr: 'ssr-entry.ts' },
        viteConfig: { plugins: [keep] },
        watchEdits: { 'greeting.ts': `export const greeting = 'MARK_AFTER'\n` },
      })
      expect(answer).toBe(path.join(build.root, 'greeting.ts'))
    },
    timeout,
  )
})
