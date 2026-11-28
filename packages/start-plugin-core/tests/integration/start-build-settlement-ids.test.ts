/**
 * The server fn a server built after a client build answers: a fixed custom
 * server fn id whose definition moves to another module in a
 * `vite build --watch` rebuild (a pin of whole-PR review S1-22: the id
 * allocator keeps the old definition's id, so the moved one gets another;
 * decision D-22 pending), and S4-02's hand-ordered builds (a client rebuild
 * fails before the server builds: the resolver reads the client-build
 * record's descriptors, step 7). Settlement design, step 0
 * (design-settlement.md rev 4, §6).
 */
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { buildStart } from '../build-start'
import {
  app,
  callGreet,
  entry,
  fns,
  start,
  unresolvedImport,
} from './start-build-settlement-app'

describe('vite build --watch: a fixed custom server fn id whose provider moves', () => {
  const moved = {
    'src/moved.ts': fns('MARK_MOVED'),
    'src/client-entry.ts': `export { getRouter } from './router'
export { label } from './client-only'
export { greet } from './moved'
`,
  }
  // The control: a build of the edited app answers the id with the moved
  // function.
  test('a build of the app after the move answers the id with the moved function', async () => {
    const build = await buildStart({
      bundler: 'vite',
      files: { ...app, ...moved },
      entry,
      start,
    })
    const { result } = await build.ssr.run(callGreet)
    expect(result).toBe('MARK_MOVED')
  })

  // `greet` keeps its custom id while its definition moves to another
  // module (the client imports it from there): the rebuilt server answers
  // the call of that id with the moved function. Red for S1-22 (the
  // allocator never releases `greet_fixed` in a watch build), not for the
  // client-build record (Gemini's review of settlement step 0).
  // Source: Astra's review of the settlement design, change 5.
  test.fails(
    'the call of the id answers the function at its new place',
    async () => {
      const build = await buildStart({
        bundler: 'vite',
        files: app,
        entry,
        start,
        watchEdits: [{ edits: moved, rebuilds: ['ssr'] }],
      })
      const { result } = await build.ssr.run(callGreet)
      expect(result).toBe('MARK_MOVED')
    },
  )
})

describe('hand-ordered builds: a client rebuild fails before the server builds', () => {
  // A program builds the client in watch mode, its rebuild fails (an
  // import that does not resolve), and then builds the server, as Start's
  // build-order error tells it to ("build `builder.environments.client`
  // before `builder.environments.ssr`"). The previous client build is the
  // one on disk: the server answers its call.
  // Source: whole-PR review S4-02 (V-41, Astra's `probe.mjs registry`).
  test('S4-02: the server answers the call of the last written client build', async () => {
    const build = await buildStart({
      bundler: 'vite',
      files: app,
      entry,
      start,
      viteConfig: { environments: { client: { build: { watch: {} } } } },
      viteBuild: async (builder) => {
        const watcher = (await builder.build(
          builder.environments.client!,
        )) as unknown as {
          on: (event: 'event', listener: (e: { code: string }) => void) => void
          close: () => Promise<void>
        }
        /** Resolves at the watcher's next event `code`; rejects after 20 s. */
        const next = (code: string) =>
          new Promise<void>((resolve, reject) => {
            const timer = setTimeout(
              () => reject(new Error(`test: no ${code} of the client`)),
              20_000,
            )
            watcher.on('event', (e) => {
              if (e.code === code) {
                clearTimeout(timer)
                resolve()
              }
            })
          })
        try {
          await next('BUNDLE_END')
          const failed = next('ERROR')
          for (const [file, text] of Object.entries(unresolvedImport)) {
            await writeFile(path.join(builder.config.root, file), text)
          }
          await failed
        } finally {
          await watcher.close()
        }
        await builder.build(builder.environments.ssr!)
      },
    })
    const { result } = await build.ssr.run(callGreet)
    expect(result).toBe('MARK_GREET')
  })
})
