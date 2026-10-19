/**
 * Control tests of the Rsbuild dev-server harness (rsbuild-dev-server.ts):
 * `edit()` waits for the rebuild of the edited modules, `settle()` for the
 * compiles of every write (plugins' included), and `outputs()` returns what
 * the environment emits afterwards.
 */
import { readFile, writeFile } from 'node:fs/promises'
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
