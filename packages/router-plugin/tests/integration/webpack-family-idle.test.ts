/**
 * Assumption test (no tripwire: R136 superseded, "Assumption tests",
 * 2026-11-13). The assumption, which neither webpack nor Rspack documents: a
 * watching compiler is not idle in its `done` hook and is idle in
 * `afterDone`, and `watching.invalidate()` asked there starts one more
 * compilation. The code relying on it: the webpack-family hosts' stale-set
 * drain (router-utils `hosts/rebuild.ts`, `StaleSetDrain.wake`), which asks
 * an idle compiler for a compilation when a stale set fills between
 * compilations (another environment's event, a registry change). Fails on
 * the Rspack Rsbuild runs, or on webpack, when either changes. No upstream
 * issue (private behaviour).
 */
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { rspack } from '@rsbuild/core'
import webpack from 'webpack'
import { runDirectory } from '@tanstack/compiler-test-utils/run-directory'

const timeout = 30_000

interface Watching {
  invalidate: () => void
  close: (callback: () => void) => void
}
interface WatchCompiler {
  idle: boolean
  hooks: {
    done: { tap: (name: string, fn: () => void) => void }
    afterDone: { tap: (name: string, fn: () => void) => void }
  }
  watch: (
    options: { aggregateTimeout: number },
    callback: (error: Error | null) => void,
  ) => Watching
}

const bundlers: Array<
  [string, (options: Record<string, unknown>) => WatchCompiler]
> = [
  ['rspack', (options) => rspack(options) as unknown as WatchCompiler],
  ['webpack', (options) => webpack(options) as unknown as WatchCompiler],
]

const roots: Array<string> = []
afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

describe.each(bundlers)('%s watch compiler', (_name, create) => {
  test(
    'is idle in afterDone, not in done, and a compilation asked for in afterDone runs',
    async () => {
      const root = fs.mkdtempSync(path.join(runDirectory(), 'tsr-idle-'))
      roots.push(root)
      fs.mkdirSync(path.join(root, 'src'))
      fs.writeFileSync(path.join(root, 'src/entry.js'), 'export const a = 1\n')
      // older than the watcher's start, so its first scan reports no change
      const past = new Date(Date.now() - 60_000)
      fs.utimesSync(path.join(root, 'src/entry.js'), past, past)
      const compiler = create({
        mode: 'development',
        context: root,
        entry: './src/entry.js',
        devtool: false,
        output: { path: path.join(root, 'dist') },
        infrastructureLogging: { level: 'error' },
      })
      const idleAt: Array<{ hook: string; idle: boolean }> = []
      let done = 0
      const finished = new Promise<void>((resolve) => {
        compiler.hooks.done.tap('test', () => {
          idleAt.push({ hook: 'done', idle: compiler.idle })
        })
        compiler.hooks.afterDone.tap('test', () => {
          idleAt.push({ hook: 'afterDone', idle: compiler.idle })
          if (++done === 1) {
            watching.invalidate()
          } else {
            resolve()
          }
        })
      })
      const watching = compiler.watch({ aggregateTimeout: 0 }, (error) => {
        if (error) {
          throw error
        }
      })
      try {
        await finished
      } finally {
        await new Promise<void>((resolve) => watching.close(resolve))
      }
      expect(idleAt).toEqual([
        { hook: 'done', idle: false },
        { hook: 'afterDone', idle: true },
        { hook: 'done', idle: false },
        { hook: 'afterDone', idle: true },
      ])
    },
    timeout,
  )
})
