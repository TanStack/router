/**
 * Freshness of a Start app on Vite's dev server: after a file event, every
 * module an environment serves is compiled against the files as they are,
 * however the event reached the environments' hooks and whatever was in
 * flight meanwhile.
 */
import { open } from 'node:fs/promises'
import { describe, expect, onTestFinished, test } from 'vitest'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
import { waitForOutcome } from '@tanstack/compiler-test-utils/outcome'
import { startDevServer } from '../dev-server'
import { startBrowserStartDevServer } from './importProtection/client-pages'
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
  // Bug: the host handed each environment the one result of the event's
  // invalidation through the identity of `read`; with a `read` per
  // environment, SSR's hook asked again and got nothing, so SSR kept the
  // server fn until a restart.
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
  // Bug: the event read the file empty, the empty text it had at its
  // creation, and was dropped as a repeat without waiting for the text;
  // `c.ts` kept its plan until `a.ts` was saved again.
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
  // Bug: the host invalidated `d.ts` as part of the hot update, which leaves
  // a transform in flight to finish and be kept; comparing its output with
  // the last one found no change, and `d.ts` kept the mock.
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

describe('Vite dev: a dependent that stops compiling', () => {
  // The page loads `main.ts`, which imports `d.ts` and `x.ts`; `x.ts`
  // re-exports `b.ts`'s `base` and accepts its own updates, so an update of
  // `b.ts` stops there. `d.ts` calls `base.handler()` with no
  // implementation: fine while `base` is a plain object, an error once it is
  // a server fn builder. After that edit of `b.ts` the error shows: the page
  // loads `d.ts` again, and the dev server reports its compile error.
  // Bug: the host compiled each dependent itself to keep unchanged ones out
  // of the update, and a dependent whose compile failed counted as
  // unchanged: nothing loaded `d.ts` again, and its error showed only once
  // something requested it.
  // Source: Fable 5.2 review of the Vite host (F6-5).
  test(
    'its error shows without a request of it',
    async () => {
      const server = await startBrowserStartDevServer({
        files: {
          'src/b.ts': `export const base = { handler: () => 'MARK_PLAIN' }\n`,
          'src/x.ts': `export { base } from './b'
if (import.meta.hot) {
  import.meta.hot.accept()
}
`,
          'src/d.ts': `import { base } from './x'
export const fn = base.handler()
`,
          'src/main.ts': `import { fn } from './d'
import { base } from './x'
export { fn, base }
`,
        },
      })
      const url = new URL('/__ip-fixture.html', server.url)
      url.searchParams.set('entry', '/src/main.ts')
      const page = await openPage(url.href, { registerCleanup: onTestFinished })
      const loaded = await page.page.waitForFunction(() => {
        const w = window as { __ipEntry?: unknown; __ipLoadError?: string }
        return w.__ipEntry ? 'loaded' : (w.__ipLoadError ?? false)
      })
      expect(await loaded.jsonValue()).toBe('loaded')
      const errorAtD = () =>
        findDiagnostics(server.diagnostics, {
          severity: 'error',
          file: 'src/d.ts',
          root: server.root,
        })
      expect(errorAtD()).toEqual([])
      await server.edit({ 'src/b.ts': builder })
      await waitForOutcome({
        applied: () => errorAtD().length > 0,
        timeout: 15_000,
        describe: () => 'no error reported at src/d.ts',
      })
    },
    timeout,
  )
})
