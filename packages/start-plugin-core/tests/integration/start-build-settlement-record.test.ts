/**
 * The Vite client-build record (settlement design rev 4 step 7, the decided
 * trigger): one setter, none when a written build starts rendering, the
 * written output at `writeBundle`, an in-memory build's at `generateBundle`.
 * Start's own output-phase failure through a watch run, a stylesheet another
 * plugin renames after Start's handlers, and `build.write: false` with
 * watch (it writes). The in-memory build without watch (the record at
 * `generateBundle`): `tests/start-manifest-plugin.test.ts`.
 */
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { buildStart } from '../build-start'
import {
  app,
  clientOnly,
  entry,
  expectRecovered,
  failedRebuild,
  scripts,
  start,
  watchedBuilds,
} from './start-build-settlement-app'
import type { Plugin } from 'vite'

describe('vite build --watch: the client-build record follows the output on disk', () => {
  // Start's own `generateBundle` fails the client's rebuild: a denied
  // import under `behavior: 'error'` (import protection's build report).
  // The record is withdrawn: the server renders the page naming no client
  // file, and the fix's builds publish the new pair.
  // Source: the step 7 trigger decision (Start's own output-phase failure).
  test("Start's own generateBundle fails (a denied import): the document names no client file, then recovers", async () => {
    const { during, after, build } = await failedRebuild(
      {
        'src/secret.server.ts': `export const secret = 'MARK_SECRET'\n`,
        'src/client-only.ts': `import { secret } from './secret.server'
export const label = secret
`,
      },
      null,
      {
        start: { importProtection: { behavior: 'error' } },
        fix: { 'src/secret.server.ts': null },
      },
    )
    const { status, rendered, named } = during.served
    expect({ status, rendered, named }).toEqual({
      status: 200,
      rendered: true,
      named: {},
    })
    expectRecovered(after, build)
  })

  // `build.write: false` with `build.watch` still writes: the record is
  // withdrawn when the build starts rendering, as for any written build,
  // so another plugin's `generateBundle` failing leaves the document
  // naming no client file (the previous ones are gone).
  // Source: the step 7 trigger decision, item 3 (Fable from Astra, Gemini).
  test("write: false in watch mode: another plugin's generateBundle fails, the document names no client file", async () => {
    const { during, after, build } = await failedRebuild(
      { 'src/client-only.ts': clientOnly('MARK_EDIT') },
      'generateBundle',
      {
        viteConfig: { environments: { client: { build: { write: false } } } },
      },
    )
    const { status, rendered, named } = during.served
    expect({ status, rendered, named }).toEqual({
      status: 200,
      rendered: true,
      named: {},
    })
    expectRecovered(after, build)
  })

  // `build.watch.skipWrite` with `build.write` on: Vite empties the client's
  // output directory when the build starts rendering and writes nothing,
  // so there is no client build on disk and the document names no client
  // file (the record is withdrawn, nothing commits it).
  // Source: Astra's re-check of settlement step 7 (`skip-write-seeded.mjs`;
  // c511439389 and d8afe14c23 named the missing entry).
  test('watch.skipWrite: the client writes nothing, the document names no client file', async () => {
    const builds = watchedBuilds()
    let served!: Awaited<ReturnType<typeof builds.served>>
    const build = buildStart({
      bundler: 'vite',
      files: app,
      entry,
      start,
      viteConfig: {
        plugins: [builds.plugin],
        environments: {
          client: { build: { watch: { skipWrite: true } } },
        },
      },
      watchEdits: [
        {
          edits: { 'src/client-only.ts': clientOnly('MARK_EDIT') },
          when: async () => {
            served = await builds.served()
          },
        },
      ],
    })
    // (the harness reads a client output, and none is written)
    await expect(build).rejects.toThrow(
      'expected client and SSR outputs, got ssr',
    )
    const { status, rendered, named } = served
    expect({ status, rendered, named }).toEqual({
      status: 200,
      rendered: true,
      named: {},
    })
    expect(builds.state.clientRenders).toBeGreaterThan(0)
    expect(builds.state.clientWrites).toBe(0)
  })
})

describe('vite build: the client-build record is of the written bundle', () => {
  // Another plugin renames the client's stylesheet in a post-ordered
  // `generateBundle` (after Start's handlers), with the entry's CSS
  // metadata: the record is read from the bundle `writeBundle` gets, so the
  // document links the renamed file, which is on disk.
  // Source: Astra's cross-check of the step 7 trigger (`crosscheck.mjs`,
  // `css`; Vite 7.3.8 and 8.3.8).
  test('a stylesheet renamed by a later plugin: the document links the renamed file, on disk', async () => {
    const builds = watchedBuilds()
    const rename: Plugin = {
      name: 'test:rename-css',
      enforce: 'post',
      applyToEnvironment: (environment) => environment.name === 'client',
      generateBundle: {
        order: 'post',
        handler(_options, bundle) {
          for (const output of Object.values(bundle)) {
            const css =
              output.type === 'chunk' && output.viteMetadata?.importedCss
            if (!css) {
              continue
            }
            for (const old of [...css]) {
              const fileName = old.replace(/[^/]+$/, (name) => `final-${name}`)
              const asset = bundle[old]
              if (asset?.type === 'asset' && !bundle[fileName]) {
                this.emitFile({
                  type: 'asset',
                  fileName,
                  source: asset.source,
                })
                delete bundle[old]
              }
              css.delete(old)
              css.add(fileName)
            }
          }
        },
      },
    }
    await buildStart({
      bundler: 'vite',
      files: {
        ...app,
        'src/app.css': `.probe { color: red; }\n`,
        'src/client-entry.ts': `import './app.css'
${app['src/client-entry.ts']}`,
      },
      entry,
      start,
      viteConfig: { plugins: [builds.plugin, rename] },
    })
    const served = await builds.served()
    const css = Object.keys(served.named).filter((file) =>
      file.endsWith('.css'),
    )
    expect(css.length).toBeGreaterThan(0)
    expect(
      css.every((file) => file.split('/').pop()!.startsWith('final-')),
    ).toBe(true)
    expect(css.filter((file) => served.named[file] === null)).toEqual([])
    expect(scripts(served).missing).toEqual([])
  })

  // A client with a second entry is no client build Start can describe:
  // the build fails before anything is written, as on c511439389 (its
  // capture threw at `generateBundle`), so no chunk on disk carries an id
  // of a server fn the rejected build bundled.
  // Source: Astra's review of settlement step 7 (`multi-candidate.log`).
  test('a client with two entries: the build fails and writes no JavaScript', async () => {
    let clientDir = ''
    const outDir: Plugin = {
      name: 'test:client-out-dir',
      applyToEnvironment: (environment) => environment.name === 'client',
      buildStart() {
        clientDir = path.resolve(
          this.environment.config.root,
          this.environment.config.build.outDir,
        )
      },
    }
    const failed = await buildStart({
      bundler: 'vite',
      files: {
        ...app,
        'src/second.ts': `import { createServerFn } from '@tanstack/react-start'
export const second = createServerFn().handler(async () => 'MARK_SECOND')
console.log(second)
`,
      },
      entry,
      start,
      viteConfig: {
        plugins: [outDir],
        environments: {
          client: {
            build: {
              rolldownOptions: {
                input: {
                  index: 'src/client-entry.ts',
                  second: 'src/second.ts',
                },
              },
            },
          },
        },
      },
    }).then(
      () => null,
      (error: unknown) => error,
    )
    expect(String(failed)).toContain('multiple entries detected')
    const js = existsSync(clientDir)
      ? readdirSync(clientDir, { recursive: true }).filter((file) =>
          String(file).endsWith('.js'),
        )
      : []
    expect(js).toEqual([])
  })
})
