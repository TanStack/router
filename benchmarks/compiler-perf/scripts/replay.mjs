// Record/replay of the TanStack compiler's outputs, for the "floor" scenarios.
//
// Inert unless COMPILER_PERF_REPLAY is `record` or `replay`.
//
// - record: every hook of a TanStack plugin that returns code (Vite/Rolldown
//   `transform`, `load`, `renderChunk`; Rsbuild `api.transform` handlers;
//   unplugin `transform`/`load` hooks under Rspack; Rspack loaders shipped by
//   `@tanstack/*` packages) runs for real and its result is stored under
//   (environment, plugin, hook, id, hash of the input code). The store is
//   written to COMPILER_PERF_REPLAY_FILE on process exit.
// - replay: the store is loaded when the plugin is created (before the
//   bundler starts; the load time is reported so the harness can subtract
//   it), and those hooks return the stored result without running. A call
//   without a stored result runs the real hook and counts as a miss.
//
// So a replay run produces the same modules as the recorded run while the
// compiler's transforms cost (almost) nothing: its time is the floor for the
// current output. Other hooks of the same plugins (resolveId, the route
// generator in configResolved / Rspack beforeRun, hotUpdate, generateBundle,
// ...) still run and are timed separately (`realHooks` in the stats).
//
// Plugins are selected by name (COMPILER_PERF_REPLAY_PLUGINS, a
// case-insensitive regex, default `tanstack`) and Rspack loaders by the name
// of the package that ships them (`@tanstack/*`), so the same harness works
// on any compiler implementation.
//
// Limits: side effects of a replayed hook (state other hooks read later,
// `this.addWatchFile`, `this.emitFile`, extra `this.load` calls) do not
// happen in replay. The harness checks that replayed builds emit the same
// files and that replayed dev servers serve the same modules.

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import Module, { createRequire } from 'node:module'
import { performance } from 'node:perf_hooks'
import v8 from 'node:v8'

const env = process.env
export const replayMode =
  env.COMPILER_PERF_REPLAY === 'record' || env.COMPILER_PERF_REPLAY === 'replay'
    ? env.COMPILER_PERF_REPLAY
    : undefined
const PLUGIN_RE = new RegExp(
  env.COMPILER_PERF_REPLAY_PLUGINS ?? 'tanstack',
  'i',
)

// Hooks whose result is the code of a module or chunk.
const REPLAYED = new Set(['transform', 'load', 'renderChunk'])
// Other hooks of the selected plugins: run for real, timed.
const TIMED = [
  'config',
  'configResolved',
  'configureServer',
  'buildStart',
  'resolveId',
  'moduleParsed',
  'generateBundle',
  'writeBundle',
  'buildEnd',
  'closeBundle',
  'transformIndexHtml',
  'hotUpdate',
  'handleHotUpdate',
  'watchChange',
]
const WRAPPED = Symbol.for('compiler-perf.replay.wrapped')
const MISS = Symbol('miss')
const UNDEFINED = '\u0000undefined'

const require = createRequire(import.meta.url)

// Vite bundles the config (and this file with it) and may load it more than
// once per process; the loader wrapper imports this file separately. Keep the
// state global.
const state = (globalThis[Symbol.for('compiler-perf.replay')] ??= init())

function init() {
  const s = {
    store: new Map(),
    served: new Map(),
    stats: {
      mode: replayMode,
      pid: process.pid,
      loadMs: 0,
      entries: 0,
      hits: 0,
      misses: 0,
      missSamples: [],
      missesByHook: {},
      hitsByHook: {},
      wrappedPlugins: [],
      wrappedLoaders: [],
      realHooks: {},
      replayedHooks: {},
      rspackHooks: {},
    },
  }
  if (!replayMode) {
    return s
  }
  if (replayMode === 'replay') {
    const t0 = performance.now()
    const raw = v8.deserialize(fs.readFileSync(env.COMPILER_PERF_REPLAY_FILE))
    for (const [key, entry] of raw) {
      entry.values = entry.values.map((v) =>
        v === UNDEFINED ? undefined : revive(JSON.parse(v)),
      )
      s.store.set(key, entry)
    }
    s.stats.loadMs = performance.now() - t0
    s.stats.entries = s.store.size
  }
  process.on('exit', () => {
    if (replayMode === 'record' && env.COMPILER_PERF_REPLAY_FILE) {
      const out = []
      for (const [key, entry] of s.store) {
        out.push([
          key,
          {
            values: entry.values,
            same: entry.values.every((v) => v === entry.values[0]),
          },
        ])
      }
      s.stats.entries = out.length
      fs.mkdirSync(path.dirname(env.COMPILER_PERF_REPLAY_FILE), {
        recursive: true,
      })
      fs.writeFileSync(env.COMPILER_PERF_REPLAY_FILE, v8.serialize(out))
    }
    if (env.COMPILER_PERF_REPLAY_STATS) {
      const round = (o) => {
        for (const v of Object.values(o)) {
          v.syncMs = Math.round(v.syncMs * 10) / 10
          v.settledMs = Math.round(v.settledMs * 10) / 10
        }
        return o
      }
      round(s.stats.realHooks)
      round(s.stats.replayedHooks)
      round(s.stats.rspackHooks)
      s.stats.loadMs = Math.round(s.stats.loadMs * 10) / 10
      fs.mkdirSync(path.dirname(env.COMPILER_PERF_REPLAY_STATS), {
        recursive: true,
      })
      fs.writeFileSync(
        env.COMPILER_PERF_REPLAY_STATS,
        JSON.stringify(s.stats, null, 2),
      )
    }
  })
  return s
}

const stats = state.stats

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export function hashCode(code) {
  return crypto
    .createHash('sha1')
    .update(
      typeof code === 'string' || Buffer.isBuffer(code) ? code : String(code),
    )
    .digest('base64')
}

// Fields of a hook result that bundlers read. Anything else (e.g. the lazy
// `decodedMap`/`rawMappings` getters of a Babel generate() result returned as
// is) is dropped.
const RESULT_FIELDS = [
  'code',
  'content',
  'map',
  'meta',
  'moduleSideEffects',
  'moduleType',
  'syntheticNamedExports',
]

// Results are stored as JSON (functions dropped, maps flattened); Buffers are
// kept as base64.
function serialize(value) {
  if (value === undefined) {
    return UNDEFINED
  }
  if (
    value &&
    typeof value === 'object' &&
    !Buffer.isBuffer(value) &&
    ('code' in value || 'content' in value)
  ) {
    value = Object.fromEntries(
      RESULT_FIELDS.filter((k) => value[k] !== undefined).map((k) => [
        k,
        value[k],
      ]),
    )
  }
  return JSON.stringify(value, (_key, v) =>
    // Buffers arrive here already converted by Buffer#toJSON.
    v?.type === 'Buffer' && Array.isArray(v.data)
      ? { __buffer: Buffer.from(v.data).toString('base64') }
      : v,
  )
}

function revive(value) {
  if (value && typeof value === 'object') {
    if (typeof value.__buffer === 'string') {
      return Buffer.from(value.__buffer, 'base64')
    }
    for (const key of Object.keys(value)) {
      value[key] = revive(value[key])
    }
  }
  return value
}

function save(key, value) {
  let entry = state.store.get(key)
  if (!entry) {
    entry = { values: [] }
    state.store.set(key, entry)
  }
  entry.values.push(serialize(value))
}

/** The stored result for the n-th call with this key, or MISS. */
function take(key) {
  const entry = state.store.get(key)
  if (!entry) {
    return MISS
  }
  const n = state.served.get(key) ?? 0
  state.served.set(key, n + 1)
  if (n >= entry.values.length && !entry.same) {
    return MISS
  }
  const value = entry.values[Math.min(n, entry.values.length - 1)]
  // The first use hands out the preloaded object; later ones get a copy in
  // case the bundler mutated it.
  return n === 0 || value === null || typeof value !== 'object'
    ? value
    : structuredClone(value)
}

function bump(table, label, syncMs, settledMs) {
  const e = (table[label] ??= { calls: 0, syncMs: 0, settledMs: 0 })
  e.calls++
  e.syncMs += syncMs
  e.settledMs += settledMs
}

function noteMiss(label, key) {
  stats.misses++
  stats.missesByHook[label] = (stats.missesByHook[label] ?? 0) + 1
  if (stats.missSamples.length < 30) {
    stats.missSamples.push(key.slice(0, 300))
  }
}

/**
 * Runs `run` (the real hook) or serves its stored result. `run` may return a
 * promise; a replayed result is returned synchronously.
 */
export function serve(key, label, run) {
  if (replayMode === 'replay') {
    const hit = take(key)
    if (hit !== MISS) {
      stats.hits++
      stats.hitsByHook[label] = (stats.hitsByHook[label] ?? 0) + 1
      return hit
    }
    noteMiss(label, key)
    return run()
  }
  const t0 = performance.now()
  const result = run()
  const t1 = performance.now()
  if (result && typeof result.then === 'function') {
    return result.then((value) => {
      save(key, value)
      bump(stats.replayedHooks, label, t1 - t0, performance.now() - t0)
      return value
    })
  }
  save(key, result)
  bump(stats.replayedHooks, label, t1 - t0, t1 - t0)
  return result
}

function timed(fn, label) {
  return function (...args) {
    const t0 = performance.now()
    const result = fn.apply(this, args)
    const t1 = performance.now()
    if (result && typeof result.then === 'function') {
      return result.then(
        (value) => (
          bump(stats.realHooks, label, t1 - t0, performance.now() - t0),
          value
        ),
        (error) => {
          bump(stats.realHooks, label, t1 - t0, performance.now() - t0)
          throw error
        },
      )
    }
    bump(stats.realHooks, label, t1 - t0, t1 - t0)
    return result
  }
}

// ---------------------------------------------------------------------------
// Vite / Rolldown
// ---------------------------------------------------------------------------

function envName(ctx, options) {
  return (
    ctx?.environment?.name ??
    (options?.ssr === true ? 'ssr' : options?.ssr === false ? 'client' : '')
  )
}

// Vite's dependency optimizer and HMR add per-session `v=`/`t=` queries.
export const stableId = (id) =>
  typeof id === 'string' ? id.replace(/([?&])(v|t)=[\w-]+/g, '$1$2=*') : id

function viteKey(ctx, plugin, hook, args) {
  if (hook === 'transform') {
    const [code, id, options] = args
    return `t|${envName(ctx, options)}|${plugin}|${stableId(id)}|${hashCode(code)}`
  }
  if (hook === 'load') {
    const [id, options] = args
    return `l|${envName(ctx, options)}|${plugin}|${stableId(id)}`
  }
  const [code, chunk] = args
  return `r|${envName(ctx)}|${plugin}|${chunk?.fileName}|${hashCode(code)}`
}

function wrapHook(plugin, hook, wrap) {
  const value = plugin[hook]
  if (typeof value === 'function') {
    plugin[hook] = wrap(value)
  } else if (
    value &&
    typeof value === 'object' &&
    typeof value.handler === 'function'
  ) {
    value.handler = wrap(value.handler)
  }
}

export function wrapVitePlugin(plugin) {
  if (!plugin || typeof plugin !== 'object' || plugin[WRAPPED]) {
    return
  }
  const name = plugin.name ?? ''
  if (!PLUGIN_RE.test(name)) {
    return
  }
  plugin[WRAPPED] = true
  stats.wrappedPlugins.push(name)
  for (const hook of REPLAYED) {
    const label = `${name}:${hook}`
    wrapHook(
      plugin,
      hook,
      (fn) =>
        function (...args) {
          return serve(viteKey(this, name, hook, args), label, () =>
            fn.apply(this, args),
          )
        },
    )
  }
  for (const hook of TIMED) {
    wrapHook(plugin, hook, (fn) => timed(fn, `${name}:${hook}`))
  }
}

function flattenPlugins(list, out = []) {
  for (const p of list ?? []) {
    if (Array.isArray(p)) {
      flattenPlugins(p, out)
    } else if (p && typeof p === 'object' && typeof p.then !== 'function') {
      out.push(p)
    }
  }
  return out
}

/** Vite plugin that installs record/replay; undefined when inert. */
export function replayVitePlugin() {
  if (!replayMode) {
    return undefined
  }
  return {
    name: 'compiler-perf:replay',
    enforce: 'pre',
    // Wrap as early as possible so the route generator (configResolved) is
    // timed; Vite has already flattened these plugin objects.
    config(config) {
      for (const p of flattenPlugins(config.plugins)) {
        wrapVitePlugin(p)
      }
    },
    configResolved(config) {
      for (const p of config.plugins) {
        wrapVitePlugin(p)
      }
    },
    configureServer(server) {
      for (const e of Object.values(server.environments ?? {})) {
        for (const p of e.plugins ?? []) {
          wrapVitePlugin(p)
        }
      }
    },
  }
}

// ---------------------------------------------------------------------------
// Rsbuild / Rspack
// ---------------------------------------------------------------------------

const packageNameCache = new Map()
function packageNameOf(file) {
  let dir = path.dirname(file)
  const seen = []
  let name
  for (;;) {
    if (packageNameCache.has(dir)) {
      name = packageNameCache.get(dir)
      break
    }
    seen.push(dir)
    const pkg = path.join(dir, 'package.json')
    if (fs.existsSync(pkg)) {
      try {
        name = JSON.parse(fs.readFileSync(pkg, 'utf8')).name
      } catch {}
      if (name) {
        break
      }
    }
    const parent = path.dirname(dir)
    if (parent === dir) {
      break
    }
    dir = parent
  }
  for (const d of seen) {
    packageNameCache.set(d, name)
  }
  return name
}

function loaderPathOf(loader) {
  if (typeof loader !== 'string' || loader.startsWith('builtin:')) {
    return undefined
  }
  const file = loader.split('?')[0]
  if (!path.isAbsolute(file)) {
    try {
      return require.resolve(file)
    } catch {
      return undefined
    }
  }
  return file
}

function isTanstackLoader(loader) {
  const file = loaderPathOf(loader)
  return Boolean(file && packageNameOf(file)?.startsWith('@tanstack/'))
}

function compilerName(ctx) {
  const native = ctx?.getNativeBuildContext?.()
  return native?.compiler?.name ?? native?.compiler?.options?.name ?? ''
}

/** unplugin plugin objects reach their loaders through the loader options. */
function wrapUnpluginPlugin(plugin) {
  if (!plugin || plugin[WRAPPED] || !PLUGIN_RE.test(plugin.name ?? '')) {
    return
  }
  plugin[WRAPPED] = true
  const name = plugin.name
  stats.wrappedPlugins.push(name)
  wrapHook(
    plugin,
    'transform',
    (fn) =>
      function (code, id) {
        return serve(
          `t|${compilerName(this)}|${name}|${stableId(id)}|${hashCode(code)}`,
          `${name}:transform`,
          () => fn.call(this, code, id),
        )
      },
  )
  wrapHook(
    plugin,
    'load',
    (fn) =>
      function (id) {
        return serve(
          `l|${compilerName(this)}|${name}|${id}`,
          `${name}:load`,
          () => fn.call(this, id),
        )
      },
  )
  for (const hook of ['resolveId', 'buildStart', 'buildEnd', 'watchChange']) {
    wrapHook(plugin, hook, (fn) => timed(fn, `${name}:${hook}`))
  }
}

/**
 * Wraps a TanStack Rspack loader in place: Rspack loads `commonjs`-type
 * loaders with Node's require, so the wrapped function is put into the
 * require cache under the loader's own path. The loader request (and with it
 * module identifiers and chunk ids) stays unchanged.
 */
const wrappedLoaderFiles = new Set()
function wrapLoaderFile(file) {
  if (wrappedLoaderFiles.has(file)) {
    return
  }
  wrappedLoaderFiles.add(file)
  let mod
  try {
    mod = require(file)
  } catch {
    return
  }
  const inner = typeof mod === 'function' ? mod : mod?.default
  if (typeof inner !== 'function' || mod.pitch || inner.pitch) {
    return
  }
  const label = `loader:${packageNameOf(file)}/${path.basename(file)}`
  const wrapped = function (source, map, meta) {
    runWrappedLoader(this, inner, label, source, map, meta)
  }
  wrapped.raw = mod.raw ?? inner.raw
  const entry = new Module(file)
  entry.filename = file
  entry.loaded = true
  entry.exports = wrapped
  require.cache[file] = entry
  stats.wrappedLoaders.push(label)
}

function wrapUse(use) {
  if (typeof use === 'string') {
    use = { loader: use }
  }
  if (!use || typeof use !== 'object') {
    return use
  }
  const options = use.options ?? use.query
  if (options && typeof options === 'object' && options.plugin) {
    wrapUnpluginPlugin(options.plugin)
    return use
  }
  if (use.type !== 'module' && isTanstackLoader(use.loader)) {
    wrapLoaderFile(loaderPathOf(use.loader))
  }
  return use
}

function wrapRules(rules) {
  if (!Array.isArray(rules)) {
    return
  }
  for (const rule of rules) {
    if (!rule || typeof rule !== 'object') {
      continue
    }
    if (rule.loader && !rule.use) {
      wrapUse({ loader: rule.loader, options: rule.options })
    }
    if (Array.isArray(rule.use)) {
      rule.use.forEach(wrapUse)
    } else if (typeof rule.use === 'function' && !rule.use[WRAPPED]) {
      const fn = rule.use
      rule.use = (data) => {
        const result = fn(data)
        ;(Array.isArray(result) ? result : [result]).forEach(wrapUse)
        return result
      }
      rule.use[WRAPPED] = true
    } else if (rule.use) {
      wrapUse(rule.use)
    }
    wrapRules(rule.oneOf)
    wrapRules(rule.rules)
  }
}

/** Runs a wrapped loader (see wrapLoaderFile) through record/replay. */
function runWrappedLoader(ctx, inner, label, source, map, meta) {
  const callback = ctx.async()
  const key = `L|${ctx._compiler?.name ?? ''}|${label}|${stableId(ctx.resource)}|${hashCode(source)}`
  const run = () =>
    new Promise((resolve, reject) => {
      let done = false
      let isAsync = false
      const finish = (error, content, outMap) => {
        if (done) {
          return
        }
        done = true
        if (error) {
          reject(error)
        } else {
          resolve({ content, map: outMap ?? null })
        }
      }
      // Same context, but the result comes back here.
      const proxy = Object.create(ctx, {
        async: {
          value: () => {
            isAsync = true
            return finish
          },
        },
        callback: {
          value: (...a) => {
            isAsync = true
            finish(...a)
          },
        },
      })
      let ret
      try {
        ret = inner.call(proxy, source, map, meta)
      } catch (error) {
        finish(error)
        return
      }
      if (ret && typeof ret.then === 'function') {
        ret.then(
          (value) => {
            if (!isAsync) {
              finish(null, value)
            }
          },
          (error) => finish(error),
        )
      } else if (!isAsync) {
        finish(null, ret)
      }
    })
  Promise.resolve(serve(key, label, run)).then(
    (result) => callback(null, result.content, result.map ?? undefined, meta),
    (error) => callback(error),
  )
}

/**
 * Rspack virtual modules (`experiments.VirtualModulesPlugin#writeModule`) are
 * how the TanStack Rsbuild/Rspack plugins emit generated modules whose content
 * depends on what earlier transforms found (e.g. the server function
 * resolver). Replay substitutes the n-th recorded write to a path.
 */
function wrapVirtualModules(rspack) {
  const proto = rspack?.experiments?.VirtualModulesPlugin?.prototype
  if (!proto || proto.writeModule[WRAPPED]) {
    return
  }
  // The plugin keeps its compiler private; remember it to key writes by
  // environment.
  const compilers = new WeakMap()
  const apply = proto.apply
  proto.apply = function (compiler) {
    compilers.set(this, compiler)
    return apply.call(this, compiler)
  }
  const writeModule = proto.writeModule
  proto.writeModule = function (filePath, contents) {
    const env = compilers.get(this)?.name ?? ''
    return writeModule.call(
      this,
      filePath,
      serve(
        `V|${env}|${filePath}`,
        'VirtualModulesPlugin:writeModule',
        () => contents,
      ),
    )
  }
  proto.writeModule[WRAPPED] = true
}

class ReplayRspackPlugin {
  apply(compiler) {
    wrapVirtualModules(compiler.rspack)
    const wrap = () => wrapRules(compiler.options.module?.rules)
    wrap()
    // The route generator runs in beforeRun/watchRun: time those hooks as a
    // whole, from the first tap to the last.
    for (const hook of ['beforeRun', 'watchRun']) {
      let t0
      compiler.hooks[hook].tap(
        { name: 'compiler-perf:replay', stage: -1e9 },
        () => {
          wrap()
          t0 = performance.now()
        },
      )
      compiler.hooks[hook].tap(
        { name: 'compiler-perf:replay', stage: 1e9 },
        () => {
          const ms = performance.now() - t0
          bump(stats.rspackHooks, `${compiler.name ?? ''}:${hook}`, ms, ms)
        },
      )
    }
  }
}

function wrapRsbuildPlugin(plugin) {
  const name = plugin.name
  stats.wrappedPlugins.push(name)
  return {
    ...plugin,
    setup(api) {
      const proxy = new Proxy(api, {
        get(target, prop) {
          if (prop === 'transform') {
            return (descriptor, handler) =>
              target.transform(descriptor, (ctx) =>
                serve(
                  `T|${ctx.environment?.name ?? ''}|${name}|${ctx.resource}|${hashCode(ctx.code)}`,
                  `${name}:transform`,
                  () => handler(ctx),
                ),
              )
          }
          return Reflect.get(target, prop)
        },
      })
      return plugin.setup(proxy)
    },
  }
}

/** Wraps an Rsbuild config object (see run.mjs's rsbuild.perf.config.mjs). */
export function wrapRsbuildConfig(config) {
  if (!replayMode) {
    return config
  }
  if (typeof config === 'function') {
    return async (...args) => wrapRsbuildConfig(await config(...args))
  }
  const plugins = flattenPlugins(config.plugins).map((p) =>
    PLUGIN_RE.test(p.name ?? '') && typeof p.setup === 'function'
      ? wrapRsbuildPlugin(p)
      : p,
  )
  plugins.push({
    name: 'compiler-perf:replay',
    setup(api) {
      api.modifyRspackConfig({
        order: 'post',
        handler(rspackConfig, utils) {
          wrapVirtualModules(utils.rspack)
          wrapRules(rspackConfig.module?.rules)
          ;(rspackConfig.plugins ??= []).push(new ReplayRspackPlugin())
        },
      })
    },
  })
  return { ...config, plugins }
}
