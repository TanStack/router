/**
 * Assumption test (no tripwire: R136 superseded, "Assumption tests",
 * 2026-11-13). The assumption, of the Rspack that Rsbuild runs:
 * `compilation.rebuildModule` calls of one tick are one native pass, and the
 * entry module's callback (the first call) comes once every module of the tick
 * that stayed was built. The code relying on it: the batched rebuild in
 * `rebuildModules` (router-utils `hosts/rebuild.ts`, HACK(rspack#16567)),
 * the workaround of https://github.com/web-infra-dev/rspack/issues/16567
 * (before 2.3.3, a `rebuildModule` callback is never called when the
 * module's rule match changes or another rebuild removes it; 2.3.3 calls
 * them all: see `RSPACK_REBUILD_CALLBACKS_FIXED_IN` for what the plain path
 * still needs). Fails when Rspack changes the pass (the workaround is then
 * wrong).
 */
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { rspack } from '@rsbuild/core'
import { runDirectory } from '@tanstack/compiler-test-utils/run-directory'
import { rebuildModules } from '@tanstack/router-utils/compiler'
import type { Rspack } from '@rsbuild/core'

interface LoaderState {
  /** Output per file name, instead of the file's text. */
  swap: Record<string, string>
  /** Files the second rule (and its loader) matches. */
  second: Array<string>
}

const loader = (
  tag: string,
) => `const fs = require('node:fs'), path = require('node:path')
module.exports = function (source) {
  const name = path.basename(this.resourcePath), dir = path.dirname(__dirname + '/x')
  const state = JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8'))
  fs.appendFileSync(path.join(dir, 'runs.log'), name + '\\n')
  return (state.swap[name] ?? source) + '\\n/*${tag}:' + name + '*/\\n'
}
`

const resourceOf = (m: Rspack.Module | null) =>
  (m as { resource?: string } | null)?.resource

const roots: Array<string> = []
afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

/**
 * Runs `files` in a watch compiler; the second compilation (started by
 * `watching.invalidate()` after `state` is written) runs `atFinishMake`.
 */
async function secondFinishMake<T>(
  files: Record<string, string>,
  state: LoaderState,
  atFinishMake: (
    compilation: Rspack.Compilation,
    moduleOf: (name: string) => Rspack.Module,
    runs: () => Array<string>,
  ) => Promise<T>,
): Promise<T> {
  const root = fs.mkdtempSync(path.join(runDirectory(), 'tss-rebuild-batch-'))
  roots.push(root)
  fs.mkdirSync(path.join(root, 'src'))
  for (const [name, text] of Object.entries(files)) {
    fs.writeFileSync(path.join(root, 'src', name), text)
  }
  fs.writeFileSync(path.join(root, 'first.cjs'), loader('first'))
  fs.writeFileSync(path.join(root, 'second.cjs'), loader('second'))
  // older than the watcher's start, so its first scan reports no change
  const past = new Date(Date.now() - 60_000)
  for (const dir of [root, path.join(root, 'src')]) {
    for (const name of fs.readdirSync(dir)) {
      fs.utimesSync(path.join(dir, name), past, past)
    }
  }
  const writeState = (s: LoaderState) =>
    fs.writeFileSync(path.join(root, 'state.json'), JSON.stringify(s))
  writeState({ swap: {}, second: [] })
  const runsLog = path.join(root, 'runs.log')
  let second: Array<string> = []
  const inSecond = (file: string) => second.includes(path.basename(file))
  const compiler = rspack({
    mode: 'development',
    context: root,
    entry: './src/entry.js',
    devtool: false,
    output: { path: path.join(root, 'dist') },
    module: {
      rules: [
        {
          test: (f: string) => f.endsWith('.js') && !inSecond(f),
          use: [path.join(root, 'first.cjs')],
        },
        {
          test: (f: string) => f.endsWith('.js') && inSecond(f),
          use: [path.join(root, 'second.cjs')],
        },
      ],
    },
    infrastructureLogging: { level: 'error' },
  })
  let compilations = 0
  let answer: Promise<T> | undefined
  compiler.hooks.finishMake.tapPromise('test', (compilation) => {
    if (++compilations !== 2) {
      return Promise.resolve()
    }
    const moduleOf = (name: string) => {
      const m = [...compilation.modules].find(
        (x) => path.basename(resourceOf(x) ?? '') === name,
      )
      if (!m) {
        throw new Error(`no module of ${name}`)
      }
      return m
    }
    fs.writeFileSync(runsLog, '')
    const runs = () =>
      fs.readFileSync(runsLog, 'utf8').split('\n').filter(Boolean)
    answer = atFinishMake(compilation, moduleOf, runs)
    return answer.then(() => undefined)
  })
  try {
    await new Promise<void>((resolve, reject) => {
      const watching = compiler.watch({ aggregateTimeout: 0 }, (error) => {
        if (error) {
          reject(error)
        } else if (compilations === 1) {
          writeState(state)
          second = state.second
          watching.invalidate()
        } else if (compilations === 2) {
          resolve()
        }
      })
    })
    return await answer!
  } finally {
    await new Promise<void>((resolve) => compiler.close(() => resolve()))
  }
}

const graph = {
  'entry.js': `import { a } from './a.js'\nimport { k } from './k.js'\nconsole.log(a, k)\n`,
  'a.js': `import { h } from './h.js'\nexport const a = h\n`,
  'h.js': `export const h = 1\n`,
  'k.js': `export const k = 1\n`,
}

describe(`Rspack ${rspack.rspackVersion}: rebuildModule calls of one tick`, () => {
  test("are one pass: the entry module's callback comes once every module that stayed was built", async () => {
    const atEntry = await secondFinishMake(
      graph,
      // a.js no longer imports h.js: h.js leaves the graph
      { swap: { 'a.js': 'export const a = 2\n' }, second: [] },
      (compilation, moduleOf, runs) =>
        // (what had run when the entry's callback came, once every
        // callback came, or by the deadline)
        new Promise<Array<string> | null>((resolve) => {
          const names = ['entry.js', 'a.js', 'h.js', 'k.js']
          let built: Array<string> | null = null
          let called = 0
          const timer = setTimeout(() => resolve(built), 10_000)
          for (const name of names) {
            compilation.rebuildModule(moduleOf(name), () => {
              if (name === 'entry.js') {
                built = runs()
              }
              if (++called === names.length) {
                clearTimeout(timer)
                resolve(built)
              }
            })
          }
        }),
    )
    expect(atEntry?.sort()).toEqual(['a.js', 'entry.js', 'k.js'])
  })

  test('rebuildModules settles when rebuilds remove modules or change their rule, and the graph holds the new builds', async () => {
    const result = await secondFinishMake(
      {
        ...graph,
        'entry.js': `import { a } from './a.js'\nimport { k } from './k.js'\nimport { m } from './mid.js'\nconsole.log(a, k, m)\n`,
        'mid.js': `import { x } from './x.js'\nexport const m = x\n`,
        'x.js': `export const x = 1\n`,
      },
      {
        swap: {
          'a.js': 'export const a = 2\n',
          'k.js': 'export const k = 2\n',
        },
        second: ['x.js'],
      },
      async (compilation, moduleOf) => {
        const stale = ['h.js', 'a.js', 'x.js', 'k.js']
        const modules = new Set(stale.map(moduleOf))
        await rebuildModules(
          compilation,
          new Set([...modules].map((m) => resourceOf(m)!)),
          (r) => r,
        )
        const built = new Map<string, Array<string>>()
        for (const m of compilation.modules) {
          const resource = resourceOf(m)
          if (resource) {
            const name = path.basename(resource)
            built.set(name, [
              ...(built.get(name) ?? []),
              String(m.originalSource()?.source() ?? ''),
            ])
          }
        }
        return Object.fromEntries(built)
      },
    )
    expect(result['h.js']).toBeUndefined()
    expect(result['a.js']).toEqual([
      expect.stringContaining('export const a = 2'),
    ])
    expect(result['k.js']).toEqual([
      expect.stringContaining('export const k = 2'),
    ])
    expect(result['x.js']).toEqual([expect.stringContaining('/*second:x.js*/')])
  })
})
