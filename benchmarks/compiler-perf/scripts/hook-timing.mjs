// Per-plugin hook timing for Vite (dev and build).
//
// Inert unless COMPILER_PERF_HOOKS_OUT names an output file. When enabled it
// wraps the hooks of every resolved plugin (including Vite's own JS plugins;
// Rolldown's native builtin plugins cannot be wrapped) and writes a summary on
// process exit.
//
// Two numbers per plugin/hook:
// - syncMs: time until the hook returned (for async hooks: until the first
//   await). Sequential on the main thread, so these add up to CPU time.
// - settledMs: time until the returned promise settled. Includes time spent
//   waiting for other work (other modules, `this.resolve`, I/O), so it overlaps
//   between concurrent calls and must not be summed against wall-clock.

import fs from 'node:fs'
import { performance } from 'node:perf_hooks'

const HOOKS = [
  'buildStart',
  'resolveId',
  'load',
  'transform',
  'moduleParsed',
  'renderChunk',
  'generateBundle',
  'writeBundle',
  'buildEnd',
  'closeBundle',
  'configureServer',
  'transformIndexHtml',
  'hotUpdate',
  'handleHotUpdate',
  'watchChange',
]

const WRAPPED = Symbol.for('compiler-perf.wrapped')
// Vite bundles the config file, and builds may load it more than once, so
// several copies of this module can coexist in one process: keep the state
// global.
const state = (globalThis[Symbol.for('compiler-perf.hook-timing')] ??= {
  stats: new Map(),
  installed: false,
})
const stats = state.stats

function record(plugin, hook, syncMs, settledMs) {
  const key = plugin + '\u0000' + hook
  let entry = stats.get(key)
  if (!entry) {
    entry = { plugin, hook, calls: 0, syncMs: 0, settledMs: 0 }
    stats.set(key, entry)
  }
  entry.calls++
  entry.syncMs += syncMs
  entry.settledMs += settledMs
}

function wrapFn(fn, pluginName, hook) {
  if (fn[WRAPPED]) {
    return fn
  }
  const wrapped = function (...args) {
    const t0 = performance.now()
    let result
    try {
      result = fn.apply(this, args)
    } catch (error) {
      const t = performance.now() - t0
      record(pluginName, hook, t, t)
      throw error
    }
    const t1 = performance.now()
    if (result && typeof result.then === 'function') {
      return result.then(
        (value) => {
          record(pluginName, hook, t1 - t0, performance.now() - t0)
          return value
        },
        (error) => {
          record(pluginName, hook, t1 - t0, performance.now() - t0)
          throw error
        },
      )
    }
    record(pluginName, hook, t1 - t0, t1 - t0)
    return result
  }
  wrapped[WRAPPED] = true
  return wrapped
}

export function wrapPlugin(plugin) {
  if (!plugin || typeof plugin !== 'object' || plugin[WRAPPED]) {
    return
  }
  const name = plugin.name ?? '(anonymous)'
  for (const hook of HOOKS) {
    const value = plugin[hook]
    if (typeof value === 'function') {
      plugin[hook] = wrapFn(value, name, hook)
    } else if (
      value &&
      typeof value === 'object' &&
      typeof value.handler === 'function'
    ) {
      value.handler = wrapFn(value.handler, name, hook)
    }
  }
  try {
    plugin[WRAPPED] = true
  } catch {}
}

export function hookTimingSummary() {
  return [...stats.values()].sort((a, b) => b.syncMs - a.syncMs)
}

function install(outFile) {
  if (state.installed) {
    return
  }
  state.installed = true
  process.on('exit', () => {
    fs.writeFileSync(
      outFile,
      JSON.stringify({ pid: process.pid, hooks: hookTimingSummary() }, null, 2),
    )
  })
}

export function hookTimingPlugin() {
  const outFile = process.env.COMPILER_PERF_HOOKS_OUT
  if (!outFile) {
    return { name: 'compiler-perf:hook-timing' }
  }
  install(outFile)
  return {
    name: 'compiler-perf:hook-timing',
    enforce: 'pre',
    configResolved(config) {
      for (const plugin of config.plugins) {
        wrapPlugin(plugin)
      }
    },
    // Environment plugin lists can be resolved after configResolved
    // (applyToEnvironment may return new plugin objects).
    configureServer(server) {
      for (const env of Object.values(server.environments ?? {})) {
        for (const plugin of env.plugins ?? []) {
          wrapPlugin(plugin)
        }
      }
    },
  }
}
