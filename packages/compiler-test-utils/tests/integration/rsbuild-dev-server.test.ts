/**
 * Control tests of the Rsbuild dev-server harness (rsbuild-dev-server.ts):
 * `edit()` waits for the rebuild of the edited modules, `settle()` for the
 * compiles of every write (plugins' included), and `outputs()` returns what
 * the environment emits afterwards.
 */
import { readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, onTestFinished, test } from 'vitest'
import { createRsbuildDevServer } from '../../src/rsbuild-dev-server'
import type { RsbuildPlugin, Rspack } from '@rsbuild/core'

const testsDir = path.dirname(fileURLToPath(import.meta.url))

test('rebuilds the edited module and emits the edit', async () => {
  const server = await createRsbuildDevServer({
    dir: testsDir,
    registerCleanup: onTestFinished,
    files: {
      'src/entry.ts': `import { leaf } from './leaf'\nconsole.log(leaf)\n`,
      'src/leaf.ts': `export const leaf = 'MARK_V1'\n`,
    },
  })
  const joined = async () => Object.values(await server.outputs()).join('\n')
  expect(await joined()).toContain('MARK_V1')

  await server.edit({ 'src/leaf.ts': `export const leaf = 'MARK_V2'\n` })

  expect(server.rebuilt).toContain('src/leaf.ts')
  expect(await joined()).toContain('MARK_V2')
  expect(await joined()).not.toContain('MARK_V1')
}, 30_000)

// The watcher may start the compile of an edit before its writes finish
// (on a loaded machine, before the harness even sees the write done): the
// wait must still end with that compile. Here a large file nothing imports
// keeps the writes going after the module's.
test('a compile that starts before the writes of the edit finish ends the wait', async () => {
  const server = await createRsbuildDevServer({
    dir: testsDir,
    registerCleanup: onTestFinished,
    files: {
      'src/entry.ts': `import { leaf } from './leaf'\nconsole.log(leaf)\n`,
      'src/leaf.ts': `export const leaf = 'MARK_V1'\n`,
    },
  })

  await server.edit({
    'src/leaf.ts': `export const leaf = 'MARK_V2'\n`,
    'notes/large.txt': 'x'.repeat(64 * 1024 * 1024),
  })

  expect(server.rebuilt).toContain('src/leaf.ts')
  expect(Object.values(await server.outputs()).join('\n')).toContain('MARK_V2')
}, 30_000)

// `stop()` ends the server and its watcher but keeps the app, so a test can
// edit it afterwards; `close()` removes it.
test('stop() stops the server and keeps the app until close()', async () => {
  const server = await createRsbuildDevServer({
    dir: testsDir,
    registerCleanup: onTestFinished,
    files: {
      'src/entry.ts': `import { leaf } from './leaf'\nconsole.log(leaf)\n`,
      'src/leaf.ts': `export const leaf = 'MARK_V1'\n`,
    },
  })
  await server.stop()
  const leaf = path.join(server.root, 'src/leaf.ts')
  await writeFile(leaf, `export const leaf = 'MARK_V2'\n`)
  expect(await readFile(leaf, 'utf8')).toContain('MARK_V2')
  await server.close()
  await expect(readFile(leaf, 'utf8')).rejects.toThrow()
}, 30_000)

// Rsbuild's default: each compile after an edit emits hot-update chunks with
// the edited modules, which a connected browser applies.
test.each([true, false])(
  'hmr: %s, an edit emits hot-update chunks with the edit only with hmr, and outputs() leaves them out',
  async (hmr) => {
    const server = await createRsbuildDevServer({
      dir: testsDir,
      registerCleanup: onTestFinished,
      hmr,
      files: {
        'src/entry.ts': `import { leaf } from './leaf'\nconsole.log(leaf)\n`,
        'src/leaf.ts': `export const leaf = 'MARK_V1'\n`,
      },
    })

    await server.edit({ 'src/leaf.ts': `export const leaf = 'MARK_V2'\n` })

    const updates = Object.values(await server.hotUpdates()).join('\n')
    expect(updates.includes('MARK_V2')).toBe(hmr)
    const outputs = await server.outputs()
    expect(
      Object.keys(outputs).filter((file) => file.includes('hot-update')),
    ).toEqual([])
    expect(Object.values(outputs).join('\n')).toContain('MARK_V2')
  },
  30_000,
)

test('a compile a plugin makes fail rejects the wait with its error, without waiting for the timeout', async () => {
  let compile = 0
  const server = await createRsbuildDevServer({
    dir: testsDir,
    registerCleanup: onTestFinished,
    compileTimeout: 20_000,
    files: { 'src/entry.ts': `console.log('MARK_V1')\n` },
    plugins: [
      {
        name: 'fails-the-second-compile',
        setup(api) {
          api.processAssets({ stage: 'summarize' }, () => {
            compile++
            if (compile === 2) {
              throw new Error('MARK_PLUGIN_FAILURE')
            }
          })
        },
      },
    ],
  })
  const started = Date.now()
  await expect(
    server.edit({ 'src/entry.ts': `console.log('MARK_V2')\n` }),
  ).rejects.toThrow(/Rsbuild failed to compile[\s\S]*MARK_PLUGIN_FAILURE/)
  expect(Date.now() - started).toBeLessThan(10_000)
}, 30_000)

/**
 * A plugin like a route generator: at the start of each compile, it writes
 * `src/generated.ts` from `src/source.ts` (`rewrite`: with new contents each
 * time, a plugin that never settles).
 */
function generator(rewrite = false): RsbuildPlugin {
  let count = 0
  return {
    name: 'generator',
    setup(api) {
      api.modifyRspackConfig((config) => {
        config.plugins.push({
          apply(compiler: Rspack.Compiler) {
            compiler.hooks.watchRun.tapPromise('generator', async () => {
              const root = compiler.context
              const source = await readFile(
                path.join(root, 'src/source.ts'),
                'utf8',
              )
              const version = /'(V\d)'/.exec(source)![1]
              const code = rewrite
                ? `export const generated = ${++count}\n`
                : `export const generated = 'MARK_GENERATED_${version}'\n`
              const file = path.join(root, 'src/generated.ts')
              if ((await readFile(file, 'utf8')) !== code) {
                await writeFile(file, code)
              }
            })
          },
        })
      })
    },
  }
}

const generatedApp = {
  'src/entry.ts': `import { generated } from './generated'
import { source } from './source'
console.log(generated, source)
`,
  'src/source.ts': `export const source = 'V1'\n`,
  'src/generated.ts': `export const generated = 'MARK_GENERATED_V1'\n`,
}

test('settle() waits for the compiles of the files a plugin writes in a compile', async () => {
  const server = await createRsbuildDevServer({
    dir: testsDir,
    registerCleanup: onTestFinished,
    files: generatedApp,
    plugins: [generator()],
  })
  await server.write({ 'src/source.ts': `export const source = 'V2'\n` })
  await server.settle()

  const outputs = Object.values(await server.outputs()).join('\n')
  expect(outputs).toContain('MARK_GENERATED_V2')
  expect(outputs).not.toContain('MARK_GENERATED_V1')
}, 30_000)

test('settle() waits for a compile reading each written file, unless accept() takes it', async () => {
  const server = await createRsbuildDevServer({
    dir: testsDir,
    registerCleanup: onTestFinished,
    files: { 'src/entry.ts': `console.log('MARK_V1')\n` },
  })
  await server.write({ 'notes.txt': 'unread' })
  await expect(server.settle({ timeout: 1_000 })).rejects.toThrow(
    /no compile read notes\.txt/,
  )
  await server.settle({ accept: (relative) => relative === 'notes.txt' })

  await server.write({ 'src/lazy.ts': `export const lazy = 'MARK_LAZY'\n` })
  await server.write({
    'src/entry.ts': `import('./lazy').then(console.log)\n`,
  })
  await server.settle()
  expect(Object.values(await server.outputs()).join('\n')).toContain(
    'MARK_LAZY',
  )
}, 30_000)

test('settle() rejects while a plugin writes a file the compiles read on each compile', async () => {
  const server = await createRsbuildDevServer({
    dir: testsDir,
    registerCleanup: onTestFinished,
    files: generatedApp,
    plugins: [generator(true)],
  })
  await server.write({ 'src/source.ts': `export const source = 'V2'\n` })
  await expect(server.settle()).rejects.toThrow(/keeps compiling/)
}, 30_000)

// A plugin that reports a problem once (Start's import protection with
// `log: 'once'`) reports it in the first compile that sees it; a dev server
// compiles again on its own, so the diagnostics of every compile are kept.
test('diagnostics keeps the reports of every compile; errors and warnings hold the last compile', async () => {
  let compile = 0
  const server = await createRsbuildDevServer({
    dir: testsDir,
    registerCleanup: onTestFinished,
    files: { 'src/entry.ts': `console.log('MARK_V1')\n` },
    plugins: [
      {
        name: 'reports-once',
        setup(api) {
          api.processAssets({ stage: 'report' }, ({ compilation }) => {
            compile++
            if (compile === 1) {
              compilation.warnings.push(
                new Error('MARK_WARNING_FIRST') as never,
              )
              compilation.errors.push(new Error('MARK_ERROR_FIRST') as never)
            }
          })
        },
      },
    ],
  })
  const texts = (diagnostics: Array<{ severity: string; text: string }>) =>
    diagnostics.map(({ severity, text }) => `${severity}: ${text}`)
  expect(texts(server.diagnostics)).toEqual([
    expect.stringMatching(/^error: [\s\S]*MARK_ERROR_FIRST/),
    expect.stringMatching(/^warning: [\s\S]*MARK_WARNING_FIRST/),
  ])

  const since = server.diagnostics.length
  await server.edit({ 'src/entry.ts': `console.log('MARK_V2')\n` })

  expect(server.errors).toEqual([])
  expect(server.warnings).toEqual([])
  expect(texts(server.diagnostics).slice(0, 2)).toEqual([
    expect.stringMatching(/^error: [\s\S]*MARK_ERROR_FIRST/),
    expect.stringMatching(/^warning: [\s\S]*MARK_WARNING_FIRST/),
  ])
  expect(server.diagnostics.slice(since)).toEqual([])
}, 30_000)

/** An environment compiler, with the app files its last compile read. */
interface Captured {
  compiler: Rspack.Compiler
  read: Array<string>
}

/**
 * A plugin that gives the test the environment compilers and, from each
 * compile's `done`, the app files (relative to `root`) it read.
 */
function captureCompilers(into: Array<Captured>, root: string): RsbuildPlugin {
  return {
    name: 'capture-compilers',
    setup(api) {
      api.onAfterCreateCompiler(({ compiler }) => {
        for (const environmentCompiler of 'compilers' in compiler
          ? compiler.compilers
          : [compiler]) {
          const captured: Captured = { compiler: environmentCompiler, read: [] }
          into.push(captured)
          environmentCompiler.hooks.done.tap(
            'capture-compilers',
            ({ compilation }) => {
              captured.read = [...compilation.fileDependencies]
                .filter((file) => file.startsWith(root + path.sep))
                .map((file) => path.relative(root, file))
            },
          )
        }
      })
    },
  }
}

/**
 * What a captured compiler's watcher knows (watchpack's time entries,
 * through Rspack's public `watching.watcher` and `watchFileSystem.watcher`).
 */
function watchedBy({ compiler, read }: Captured) {
  const attached = !!(compiler as { watching?: { watcher?: unknown } }).watching
    ?.watcher
  const watcher = (
    compiler.watchFileSystem as
      | { watcher?: { getTimeInfoEntries: () => Map<string, unknown> } }
      | undefined
  )?.watcher
  return {
    name: compiler.name,
    attached,
    known: new Set(watcher ? watcher.getTimeInfoEntries().keys() : []),
    read,
  }
}

// Rspack attaches its watcher on the tick after the first compile, and
// watchpack then scans the app's directories; a file deleted before that is
// never reported (FOLLOWUPS "UPSTREAM (W3-harness2)"). The start resolves
// only once the watcher knows every app file the compile read.
test('the start resolves once the watcher knows every app file the compile read', async () => {
  const compilers: Array<Captured> = []
  const server = await createRsbuildDevServer({
    dir: testsDir,
    registerCleanup: onTestFinished,
    files: {
      'src/entry.ts': `import { leaf } from './leaf'\nconsole.log(leaf)\n`,
      'src/leaf.ts': `export const leaf = 'MARK_V1'\n`,
    },
    plugins: ({ root }) => [captureCompilers(compilers, root)],
  })
  const client = watchedBy(compilers[0]!)
  expect(client.attached).toBe(true)
  expect(client.read).toEqual(
    expect.arrayContaining(['src/entry.ts', 'src/leaf.ts']),
  )
  for (const file of client.read) {
    expect(client.known.has(path.join(server.root, file))).toBe(true)
  }
}, 30_000)

// One compiler may watch for another: Rspack's RSC coordinator makes the
// server compiler watch the client compiler's files and ignores everything
// in the client's own watcher. The start must still resolve, with every
// file known to a watcher, when a compiler's watcher ignores everything.
test('the start resolves with a compiler whose watcher ignores every file, while another watches them', async () => {
  const compilers: Array<Captured> = []
  const server = await createRsbuildDevServer({
    dir: testsDir,
    registerCleanup: onTestFinished,
    compileTimeout: 10_000,
    files: {
      'src/entry.ts': `import { leaf } from './leaf'\nconsole.log(leaf)\n`,
      'src/leaf.ts': `export const leaf = 'MARK_V1'\n`,
    },
    config: {
      environments: { web: {}, node: { output: { target: 'node' } } },
    },
    plugins: ({ root }) => [
      captureCompilers(compilers, root),
      {
        name: 'ignore-all-in-node',
        setup(api) {
          api.modifyRspackConfig((config, { environment }) => {
            if (environment.name === 'node') {
              config.watchOptions = {
                ...config.watchOptions,
                ignored: () => true,
              }
            }
          })
        },
      },
    ],
  })
  const watched = compilers.map(watchedBy)
  const node = watched.find((w) => w.name === 'node')!
  const web = watched.find((w) => w.name === 'web')!
  expect(watched.map((w) => w.attached)).toEqual([true, true])
  expect(node.known.size).toBe(0)
  expect(node.read).toEqual(
    expect.arrayContaining(['src/entry.ts', 'src/leaf.ts']),
  )
  for (const file of node.read) {
    expect(web.known.has(path.join(server.root, file))).toBe(true)
  }
}, 30_000)

// A user starts the dev server on files that are already on disk. Files
// written a moment before the first compile fall within the accuracy
// watchpack allows for modification times (up to 2 s), so its first scan
// would report them changed and Rspack would start a second compile by
// itself, during a test's first edit (DECISIONS 2026-10-20 "Rsbuild
// first-edit harness fixes").
test("the app's initial files predate the first compile beyond the watcher's accuracy", async () => {
  let firstCompile: number | undefined
  const server = await createRsbuildDevServer({
    dir: testsDir,
    registerCleanup: onTestFinished,
    files: {
      'src/entry.ts': `import { leaf } from './leaf'\nconsole.log(leaf)\n`,
      'src/leaf.ts': `export const leaf = 'MARK_V1'\n`,
    },
    plugins: [
      {
        name: 'first-compile',
        setup(api) {
          api.modifyRspackConfig((config) => {
            config.plugins.push({
              apply(compiler: Rspack.Compiler) {
                compiler.hooks.watchRun.tap('first-compile', () => {
                  firstCompile ??= Date.now()
                })
              },
            })
          })
        },
      },
    ],
  })
  expect(firstCompile).toBeDefined()
  for (const file of ['package.json', 'src/entry.ts', 'src/leaf.ts']) {
    const { mtimeMs } = await stat(path.join(server.root, file))
    expect(mtimeMs + 2000, file).toBeLessThan(firstCompile!)
  }
}, 30_000)

// A compile that started before an edit's write does not compile it, even
// if it names the edited file (here for an earlier change of it): `edit()`
// waits for a compile that started once the file held the edit. A plugin
// holds that earlier compile in `watchRun` until the edit began.
test('a compile that started before the write of an edit does not end its wait', async () => {
  let hold: { held: () => void; release: Promise<void> } | undefined
  /** The contents of `src/leaf.ts` when each compile started; then `done`. */
  const compiles: Array<{ leaf: string; done: boolean }> = []
  const server = await createRsbuildDevServer({
    dir: testsDir,
    registerCleanup: onTestFinished,
    files: {
      'src/entry.ts': `import { leaf } from './leaf'\nconsole.log(leaf)\n`,
      'src/leaf.ts': `export const leaf = 'MARK_V1'\n`,
    },
    plugins: [
      {
        name: 'holds-a-compile',
        setup(api) {
          api.modifyRspackConfig((config) => {
            config.plugins.push({
              apply(compiler: Rspack.Compiler) {
                const leaf = path.join(compiler.context, 'src/leaf.ts')
                compiler.hooks.watchRun.tapPromise(
                  { name: 'holds-a-compile', stage: -2000 },
                  async () => {
                    const current = hold
                    hold = undefined
                    compiles.push({
                      leaf: await readFile(leaf, 'utf8'),
                      done: false,
                    })
                    if (current) {
                      current.held()
                      await current.release
                    }
                  },
                )
                compiler.hooks.done.tap('holds-a-compile', () => {
                  compiles.at(-1)!.done = true
                })
              },
            })
          })
        },
      },
    ],
  })
  let release = () => {}
  const held = new Promise<void>((resolve) => {
    hold = {
      held: resolve,
      release: new Promise<void>((resolveRelease) => {
        release = resolveRelease
      }),
    }
  })
  // A change of the file the watcher reports: a compile naming it starts
  // and waits in `watchRun`
  await writeFile(
    path.join(server.root, 'src/leaf.ts'),
    `export const leaf = 'MARK_V2'\n`,
  )
  await held
  const editing = server.edit({
    'src/leaf.ts': `export const leaf = 'MARK_V3'\n`,
  })
  release()
  await editing

  expect(
    compiles.some(({ leaf, done }) => leaf.includes('MARK_V3') && done),
  ).toBe(true)
  expect(Object.values(await server.outputs()).join('\n')).toContain('MARK_V3')
}, 30_000)
