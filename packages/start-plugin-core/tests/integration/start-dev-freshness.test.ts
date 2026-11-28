/**
 * Freshness of a Start app on Vite's dev server: after a file event, every
 * module an environment serves is compiled against the files as they are,
 * however the event reached the environments' hooks and whatever was in
 * flight meanwhile. Without a browser (on the macOS and Windows smoke list);
 * what a page sees: start-dev-freshness-page.test.ts.
 */
import { open } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { callServerFn, startDevServer, startRequestFiles } from '../dev-server'
import type { Plugin } from 'vite'

const timeout = 60_000

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

const builder = `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn()
`
const plain = `export const base = { handler: (fn: () => unknown) => fn }\n`
/** Builds a function on `./a`'s `base`: a server fn while `base` is a builder (its handler leaves the client). */
const importer = `import { base } from './a'
export const page = base.handler(async () => 'MARK_PAGE')
`

/** URLs of the served modules that contain `marker`. */
function containing(modules: Record<string, string>, marker: string) {
  return Object.keys(modules).filter((url) => modules[url]!.includes(marker))
}

describe('Vite dev: one file event through each environment', () => {
  /**
   * A plugin whose hook comes first and hands the later plugins of each
   * environment a `read` of their own (Vite documents a function; that one
   * object serves every environment is not promised).
   */
  const ownRead: Plugin = {
    name: 'test:own-read',
    hotUpdate: {
      order: 'pre',
      handler(ctx) {
        const read = ctx.read
        ctx.read = () => read()
      },
    },
  }

  // `a.tsx` builds a server fn on `b.ts`'s `base`; `base` becomes a plain
  // object. Both environments re-plan `a.tsx`: the client keeps its
  // handler, and SSR's `fn` is the handler itself.
  // Source: Fable 5.2 review of the Vite host (F6-1).
  test(
    "each environment's dependents are compiled again",
    async () => {
      const server = await startDevServer({
        plugins: [ownRead],
        files: {
          'src/b.ts': `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn()
`,
          'src/a.tsx': `import { base } from './b'
export const fn = base.handler(async () => 'MARK_HANDLER')
`,
        },
      })
      const ssrUrl = async () =>
        typeof (await server.import('/src/a.tsx')).fn.url
      expect(
        containing(await server.load('/src/a.tsx'), 'MARK_HANDLER'),
      ).toEqual([])
      expect(await ssrUrl()).toBe('string')
      await server.edit({
        'src/b.ts': `export const base = { handler: (fn: () => unknown) => fn }\n`,
      })
      expect(
        containing(await server.load('/src/a.tsx'), 'MARK_HANDLER'),
      ).not.toEqual([])
      expect(await ssrUrl()).toBe('undefined')
    },
    timeout,
  )
})

describe('Vite dev: the first save of a file created empty', () => {
  // `a.ts` is created empty, and `c.ts`, which imports it, compiled (the
  // handler stays in the client: `base` is nothing yet). The first save is
  // in place: the editor truncates the file, the watcher reports it, and
  // the text lands a moment later (no event of its own).
  // Source: design 3 steps 0-1 review, finding 4b (a route file starts so).
  test(
    'its importers are compiled against the saved text',
    async () => {
      const server = await startDevServer({ files: { 'src/c.ts': importer } })
      await server.edit({ 'src/a.ts': '' })
      expect(
        containing(await server.load('/src/c.ts'), 'MARK_PAGE'),
      ).not.toEqual([])
      const handle = await open(server.file('src/a.ts'), 'w')
      try {
        await sleep(20)
        await handle.write(builder)
      } finally {
        await handle.close()
      }
      await server.settle()
      expect(containing(await server.load('/src/c.ts'), 'MARK_PAGE')).toEqual(
        [],
      )
    },
    timeout,
  )
})

describe('Vite dev: a dependent whose transform is in flight across the event', () => {
  /**
   * Holds `src/d.ts`'s next client transform after every other plugin's
   * (the compiler's ended) for `ms`; `reached` resolves when it is held.
   */
  function holdD() {
    let armed: { ms: number; reached: () => void } | null = null
    const plugin: Plugin = {
      name: 'test:hold-d',
      enforce: 'post',
      async transform(_code, id) {
        if (
          this.environment.name === 'client' &&
          id.endsWith('/src/d.ts') &&
          armed
        ) {
          const { ms, reached } = armed
          armed = null
          reached()
          await sleep(ms)
        }
        return null
      },
    }
    return {
      plugin,
      arm: (ms: number) =>
        new Promise<void>((reached) => {
          armed = { ms, reached }
        }),
    }
  }

  // `d.ts` imports `lib.ts`, which marks itself server-only: the client
  // gets the mock, so its `d.ts` does not import `lib.ts`. While a request
  // of `d.ts` is held after the compiler's transform, `lib.ts` drops its
  // marker. `d.ts` is then served with `lib.ts` itself.
  // Source: Fable 5.2 review of the Vite host (F6-6).
  test(
    'it is served compiled against the file as it is after the event',
    async () => {
      const { plugin, arm } = holdD()
      const marked = `import '@tanstack/react-start/server-only'
export const secret = () => 'MARK_LIB'
`
      const server = await startDevServer({
        plugins: [plugin],
        start: { importProtection: { behavior: 'mock' } },
        files: {
          'src/lib.ts': marked,
          'src/d.ts': `import { secret } from './lib'
export const read = () => secret()
`,
        },
      })
      expect(containing(await server.load('/src/d.ts'), 'MARK_LIB')).toEqual([])
      await server.edit({
        'src/d.ts': `// held\nimport { secret } from './lib'
export const read = () => secret()
`,
      })
      const reached = arm(1_000)
      const held = server.transform('/src/d.ts').catch(() => null)
      await reached
      await server.edit({
        'src/lib.ts': `export const secret = () => 'MARK_LIB'\n`,
      })
      await held
      expect(
        containing(await server.load('/src/d.ts'), 'MARK_LIB'),
      ).not.toEqual([])
    },
    timeout,
  )
})

describe('Vite dev: a server fn file saved while its previous compile waits', () => {
  // `fns.ts` defines `oldFn`; its SSR compile waits on the resolution of
  // `./old-helper` while the file is saved with `newFn` in its place, and
  // the new text is compiled and served. The old compile ends last. A call
  // of `newFn` by its id (as a page's) still reaches it: what the
  // superseded compile found does not replace the registered functions of
  // the file. Source: the Astra round 2 architecture review (A2).
  test(
    'its new server fn is callable',
    async () => {
      let armed: { reached: () => void; release: Promise<void> } | null = null
      let release!: () => void
      const server = await startDevServer({
        plugins: [
          {
            name: 'test:slow-old-helper',
            enforce: 'pre',
            async resolveId(source) {
              if (
                this.environment.name === 'ssr' &&
                source === './old-helper' &&
                armed
              ) {
                const held = armed
                armed = null
                held.reached()
                await held.release
              }
              return null
            },
          },
        ],
        files: {
          ...startRequestFiles,
          'src/old-helper.ts': `export const helper = () => 'MARK_OLD'\n`,
          'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
import { helper } from './old-helper'
export const oldFn = createServerFn().handler(() => helper())
`,
        },
      })
      const reached = new Promise<void>((resolve) => {
        armed = {
          reached: resolve,
          release: new Promise<void>((r) => {
            release = r
          }),
        }
      })
      const held = server.transform('/src/fns.ts', 'ssr').catch(() => null)
      await reached
      await server.edit({
        'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
export const newFn = createServerFn().handler(() => 'MARK_NEW')
`,
      })
      await server.transform('/src/fns.ts', 'ssr')
      release()
      await held
      const { newFn } = await server.import('/src/fns.ts')
      expect(await callServerFn(server, newFn)).toBe('MARK_NEW')
    },
    timeout,
  )
})

describe('Vite dev: a server fn file deleted while its compile waits', () => {
  // `display.ts` defines a server fn on `./label`. The compile of its new
  // text (its hot update compiles it in SSR at once: the fn's handler
  // module is in SSR's graph) waits on the resolution of `./label` while
  // the file is deleted, and ends after the deletion (or, the control,
  // before it). Nothing of the deleted file stays: a file `./label` may now
  // find (`label.js`) asks no resolution on its behalf, and its server fn
  // is not registered again (a call of its id is refused like an unknown
  // id's). The file created again with the same text compiles and answers.
  // Source: Astra round 3 (hosts B3, architecture B3).
  const display = `import { createServerFn } from '@tanstack/react-start'
import { label } from './label'
export const fn = createServerFn().handler(() => label)
`
  test.each([
    ['ends after the deletion', true],
    ['ends before the deletion', false],
  ])(
    'the compile %s: no resolution asked for it, its server fn not registered',
    async (_, deleteFirst) => {
      let armed: { reached: () => void; release: Promise<void> } | null = null
      let release!: () => void
      let removed!: () => void
      const removal = new Promise<void>((resolve) => {
        removed = resolve
      })
      let asked: Array<string> | null = null
      const server = await startDevServer({
        plugins: [
          {
            name: 'test:slow-label',
            enforce: 'pre',
            async resolveId(source, importer) {
              if (
                source !== './label' ||
                !importer?.split('?')[0]!.endsWith('/src/display.ts')
              ) {
                return null
              }
              asked?.push(this.environment.name)
              if (this.environment.name === 'ssr' && armed) {
                const held = armed
                armed = null
                held.reached()
                await held.release
              }
              return null
            },
            // (the client's hooks run first: Start applied the removal)
            hotUpdate: {
              order: 'post',
              handler({ file, type }) {
                if (
                  this.environment.name === 'client' &&
                  type === 'delete' &&
                  file.endsWith('/src/display.ts')
                ) {
                  removed()
                }
              },
            },
          },
        ],
        files: {
          ...startRequestFiles,
          'src/label.ts': `export const label = 'MARK_LABEL'\n`,
          'src/display.ts': display,
        },
      })
      const { fn } = await server.import('/src/display.ts')
      const reached = new Promise<void>((resolve) => {
        armed = {
          reached: resolve,
          release: new Promise<void>((r) => {
            release = r
          }),
        }
      })
      await server.write({ 'src/display.ts': `// edited\n${display}` })
      await reached
      if (deleteFirst) {
        await server.write({ 'src/display.ts': null })
        await removal
        release()
      } else {
        release()
        await server.settle()
        await server.write({ 'src/display.ts': null })
      }
      await server.settle()

      asked = []
      await server.edit({ 'src/label.js': `export const label = 'MARK_JS'\n` })
      expect(asked).toEqual([])
      // (one text on every host: diagnostics spike, 2026-11-24, flag 10)
      await expect(callServerFn(server, fn)).rejects.toThrow(
        'Server function info not found for',
      )

      // (`./label` now finds `label.js`)
      await server.edit({ 'src/display.ts': display })
      const back = await server.import('/src/display.ts')
      expect(await callServerFn(server, back.fn)).toBe('MARK_JS')
    },
    timeout,
  )
})
