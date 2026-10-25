#!/usr/bin/env node
// Compiler performance harness: dev startup, HMR and production build on
// generated TanStack Start / Router apps. See ../README.md.

import { execFileSync, fork, spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { parseArgs } from 'node:util'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { analyzeCpuProfileDir } from './cpuprofile.mjs'
import {
  ALL_VARIANTS,
  PROBES,
  VARIANTS,
  appDir,
  appsRoot,
  benchRoot,
  frameworkOf,
  hasRsbuild,
  isStart,
  writeApp,
} from './generate.mjs'
import { descendantsRssMb } from './memory.mjs'
import { summarize, writeMarkdown } from './report.mjs'

const repoRoot = path.resolve(benchRoot, '../..')
const require = createRequire(path.join(benchRoot, 'package.json'))
const now = () => performance.timeOrigin + performance.now()
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const ALL_SCENARIOS = [
  'dev-cold',
  'dev-warm',
  'dev-compile',
  'hmr',
  'build',
  'profile',
  'rsbuild',
]
// Not in the default set: `rsbuild-build`, `rsbuild-dev` (the halves of
// `rsbuild`), `floor`, `memory`, `leak`.
const EXTRA_SCENARIOS = [
  'rsbuild-build',
  'rsbuild-dev',
  'floor',
  'memory',
  'leak',
]
const FLOOR_KINDS = ['build', 'dev-compile', 'dev-cold', 'hmr', 'rsbuild-build']
const { values: args } = parseArgs({
  options: {
    label: { type: 'string', default: 'run' },
    out: { type: 'string' },
    variants: { type: 'string', default: VARIANTS.join(',') },
    scenarios: { type: 'string', default: ALL_SCENARIOS.join(',') },
    runs: { type: 'string', default: '5' },
    warmup: { type: 'string', default: '1' },
    'hmr-iterations': { type: 'string', default: '20' },
    'hmr-warmup': { type: 'string', default: '3' },
    'max-busy': { type: 'string', default: '1.5' },
    'quiet-timeout': { type: 'string', default: '1800' },
    retries: { type: 'string', default: '5' },
    'skip-package-builds': { type: 'boolean', default: false },
    port: { type: 'string', default: '4810' },
    floor: { type: 'string', default: FLOOR_KINDS.join(',') },
    'memory-runs': { type: 'string', default: '3' },
    'leak-cycles': { type: 'string', default: '50' },
    help: { type: 'boolean', default: false },
  },
})

if (args.help) {
  console.log(`Usage: node scripts/run.mjs [options]
  --label <name>            result label (default "run")
  --out <dir>               output directory (default results/<label>)
  --variants <list>         ${VARIANTS.join(',')} (default; all: ${ALL_VARIANTS.join(',')})
  --scenarios <list>        ${ALL_SCENARIOS.join(',')} (default)
                            also: ${EXTRA_SCENARIOS.join(',')}
  --runs <n>                measured runs for startup/build (default 5)
  --warmup <n>              discarded runs before measuring (default 1)
  --hmr-iterations <n>      measured edits per HMR kind (default 20)
  --hmr-warmup <n>          discarded edits per HMR kind (default 3)
  --max-busy <cores>        wait until other processes use fewer cores (default 1.5)
  --quiet-timeout <s>       max wait for a quiet machine, then flag the run (default 1800)
  --retries <n>             repeat runs flagged for load during the run (default 5 per scenario)
  --floor <list>            floor (record/replay) scenarios, default ${FLOOR_KINDS.join(',')}
  --memory-runs <n>         runs per memory scenario (default 3)
  --leak-cycles <n>         HMR edit+revert cycles in the leak check (default 50)
  --skip-package-builds     do not run the Nx package builds first`)
  process.exit(0)
}

const RUNS = Number(args.runs)
const WARMUP = Number(args.warmup)
const HMR_ITERATIONS = Number(args['hmr-iterations'])
const HMR_WARMUP = Number(args['hmr-warmup'])
const MAX_BUSY = Number(args['max-busy'])
const QUIET_TIMEOUT_MS = Number(args['quiet-timeout']) * 1000
const RETRIES = Number(args.retries)
const PORT = Number(args.port)
const MEMORY_RUNS = Number(args['memory-runs'])
const LEAK_CYCLES = Number(args['leak-cycles'])
const variants = args.variants.split(',').filter(Boolean)
for (const variant of variants) {
  if (!ALL_VARIANTS.includes(variant)) {
    throw new Error(`Unknown variant ${variant}`)
  }
}
const scenarios = new Set(args.scenarios.split(',').filter(Boolean))
if (scenarios.has('rsbuild')) {
  scenarios.add('rsbuild-build')
  scenarios.add('rsbuild-dev')
}
const floorKinds = new Set(args.floor.split(',').filter(Boolean))
const outDir = path.resolve(
  args.out ?? path.join(benchRoot, 'results', args.label),
)
fs.mkdirSync(outDir, { recursive: true })
const logFile = path.join(outDir, 'run.log')
const log = (...parts) => {
  const line = `[${new Date().toISOString()}] ${parts.join(' ')}`
  console.log(line)
  fs.appendFileSync(logFile, line + '\n')
}

// ---------------------------------------------------------------------------
// Machine load
// ---------------------------------------------------------------------------

function readCpuTimes() {
  const line = fs.readFileSync('/proc/stat', 'utf8').split('\n')[0]
  const parts = line.trim().split(/\s+/).slice(1).map(Number)
  const idle = parts[3] + (parts[4] ?? 0)
  const total = parts.reduce((a, b) => a + b, 0)
  return { idle, total }
}

/** Cores kept busy by other processes over `ms` while the harness is idle. */
async function busyCores(ms = 2000) {
  if (!fs.existsSync('/proc/stat')) {
    return os.loadavg()[0]
  }
  const a = readCpuTimes()
  await sleep(ms)
  const b = readCpuTimes()
  const total = b.total - a.total
  return total ? ((total - (b.idle - a.idle)) / total) * os.cpus().length : 0
}

/** CPU jiffies of this process and all its descendants (dev servers, builds, Chromium). */
function ownTreeJiffies() {
  const parents = new Map()
  const times = new Map()
  for (const entry of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(entry)) {
      continue
    }
    try {
      const stat = fs.readFileSync(`/proc/${entry}/stat`, 'utf8')
      // Fields after the parenthesised command: state ppid ... utime(14) stime(15) cutime(16) cstime(17)
      const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
      parents.set(Number(entry), Number(fields[1]))
      times.set(
        Number(entry),
        Number(fields[11]) +
          Number(fields[12]) +
          Number(fields[13]) +
          Number(fields[14]),
      )
    } catch {}
  }
  let total = 0
  for (const [pid, t] of times) {
    for (let p = pid; p > 1; p = parents.get(p) ?? 0) {
      if (p === process.pid) {
        total += t
        break
      }
    }
  }
  return total
}

/**
 * Measures how many cores other processes kept busy while a run executed:
 * system-wide busy time minus the harness's own process tree. Exited
 * children count through cutime/cstime once reaped.
 */
function startCpuWatch() {
  if (!fs.existsSync('/proc/stat')) {
    return () => ({})
  }
  const sys0 = readCpuTimes()
  const own0 = ownTreeJiffies()
  const t0 = now()
  return () => {
    const sys1 = readCpuTimes()
    const own1 = ownTreeJiffies()
    const elapsedS = (now() - t0) / 1000
    // /proc/stat sums all CPUs; both counters use USER_HZ (100/s).
    const sysBusy = sys1.total - sys0.total - (sys1.idle - sys0.idle)
    const others =
      Math.max(0, sysBusy - (own1 - own0)) / 100 / Math.max(elapsedS, 0.01)
    const ours = (own1 - own0) / 100 / Math.max(elapsedS, 0.01)
    return {
      othersBusyDuring: Math.round(others * 100) / 100,
      ownCoresDuring: Math.round(ours * 100) / 100,
    }
  }
}

async function waitForQuiet(sampleMs = 2000) {
  const t0 = Date.now()
  let busy = await busyCores(sampleMs)
  while (busy > MAX_BUSY && Date.now() - t0 < QUIET_TIMEOUT_MS) {
    log(
      `machine busy (${busy.toFixed(1)} cores used by others, load1 ${os.loadavg()[0].toFixed(2)}), waiting`,
    )
    await sleep(15_000)
    busy = await busyCores(sampleMs)
  }
  return {
    busyCores: Math.round(busy * 100) / 100,
    load1: Math.round(os.loadavg()[0] * 100) / 100,
    flagged: busy > MAX_BUSY,
  }
}

// ---------------------------------------------------------------------------
// Process helpers
// ---------------------------------------------------------------------------

function clean(dir, { cache = true } = {}) {
  for (const sub of ['dist', 'dist-rsbuild', 'node_modules/.tmp']) {
    fs.rmSync(path.join(dir, sub), { recursive: true, force: true })
  }
  if (cache) {
    fs.rmSync(path.join(dir, '.vite-cache'), { recursive: true, force: true })
    fs.rmSync(path.join(dir, 'node_modules/.cache'), {
      recursive: true,
      force: true,
    })
  }
}

function profilingEnv(profileDir) {
  if (!profileDir) {
    return { execArgv: [], env: {} }
  }
  fs.rmSync(profileDir, { recursive: true, force: true })
  fs.mkdirSync(profileDir, { recursive: true })
  return {
    execArgv: ['--cpu-prof', `--cpu-prof-dir=${profileDir}`],
    env: { COMPILER_PERF_HOOKS_OUT: path.join(profileDir, 'hooks.json') },
  }
}

function readAttribution(profileDir, wallMs) {
  const cpu = analyzeCpuProfileDir(profileDir)
  const hooksFile = path.join(profileDir, 'hooks.json')
  const hooks = fs.existsSync(hooksFile)
    ? JSON.parse(fs.readFileSync(hooksFile, 'utf8')).hooks
    : []
  return { wallMs, cpu, hooks }
}

// ---------------------------------------------------------------------------
// Floor (record/replay, see replay.mjs) and memory instrumentation
// ---------------------------------------------------------------------------

const replayRoot = path.join(appsRoot, '.replay', args.label)
const memoryModuleUrl = pathToFileURL(
  path.join(benchRoot, 'scripts/memory.mjs'),
).href

/**
 * Process options for instrumented runs.
 * - replay: { mode: 'record' | 'replay', name } (store file per name)
 * - mem: 'ipc' (dev driver answers { type: 'mem' }) or 'exit' (CLI process
 *   writes a snapshot on exit); both expose the GC.
 */
function instrumentation({ replay, mem } = {}) {
  const env = {}
  const execArgv = []
  let statsFile
  let memFile
  if (replay) {
    fs.mkdirSync(replayRoot, { recursive: true })
    statsFile = path.join(replayRoot, `${replay.name}.${replay.mode}.json`)
    fs.rmSync(statsFile, { force: true })
    Object.assign(env, {
      COMPILER_PERF_REPLAY: replay.mode,
      COMPILER_PERF_REPLAY_FILE: path.join(replayRoot, `${replay.name}.bin`),
      COMPILER_PERF_REPLAY_STATS: statsFile,
    })
  }
  if (mem) {
    execArgv.push('--expose-gc')
    if (mem === 'exit') {
      memFile = path.join(
        os.tmpdir(),
        `compiler-perf-mem-${process.pid}-${Date.now()}.json`,
      )
      fs.rmSync(memFile, { force: true })
      execArgv.push('--import', memoryModuleUrl)
      env.COMPILER_PERF_MEM_OUT = memFile
    }
  }
  return {
    env,
    execArgv,
    replay,
    readReplayStats() {
      if (!statsFile || !fs.existsSync(statsFile)) {
        throw new Error(`${replay?.name}: no replay stats (${statsFile})`)
      }
      const stats = JSON.parse(fs.readFileSync(statsFile, 'utf8'))
      if (stats.mode !== replay.mode || !stats.wrappedPlugins.length) {
        throw new Error(
          `${replay.name}: replay was not installed (${JSON.stringify(stats).slice(0, 300)})`,
        )
      }
      return stats
    },
    readMemFile() {
      if (!memFile || !fs.existsSync(memFile)) {
        throw new Error(`no memory snapshot (${memFile})`)
      }
      const m = JSON.parse(fs.readFileSync(memFile, 'utf8'))
      fs.rmSync(memFile, { force: true })
      return m
    },
  }
}

/** Max RSS (MB) of the descendants of `pid`, sampled until stopped. */
function pollChildrenRss(pid) {
  let max = 0
  const sample = () => {
    max = Math.max(max, descendantsRssMb(pid))
  }
  const timer = setInterval(sample, 200)
  return () => {
    clearInterval(timer)
    sample()
    return Math.round(max * 10) / 10
  }
}

const MEM_KEYS = [
  'peakRssMb',
  'rssMb',
  'heapUsedMb',
  'externalMb',
  'arrayBuffersMb',
  'childrenRssMb',
]
const pickMem = (snapshot) =>
  Object.fromEntries(MEM_KEYS.map((k) => [k, snapshot[k]]))

const cap = (k) => k[0].toUpperCase() + k.slice(1)

/** Route generator time in a replay/record run (real hooks, see replay.mjs). */
function generatorMs(stats) {
  let ms = 0
  for (const [label, h] of Object.entries(stats.realHooks ?? {})) {
    if (
      /generator/i.test(label) &&
      /:(config|configResolved|buildStart)$/.test(label)
    ) {
      ms += h.settledMs
    }
  }
  const rspack = Object.values(stats.rspackHooks ?? {}).map((h) => h.settledMs)
  return ms + (rspack.length ? Math.max(...rspack) : 0)
}

/**
 * Adds replay counters to a run's metrics. In replay mode the store's load
 * time (paid before the bundler starts) is subtracted from `timeKeys`; the
 * unadjusted values are kept as raw<Key>.
 */
function withReplay(metrics, inst, timeKeys) {
  if (!inst.replay) {
    return metrics
  }
  const stats = inst.readReplayStats()
  const sum = (table, key) =>
    Object.values(table ?? {}).reduce((a, h) => a + h[key], 0)
  const out = { ...metrics }
  if (inst.replay.mode === 'replay') {
    for (const key of timeKeys) {
      if (typeof out[key] === 'number') {
        out[`raw${cap(key)}`] = out[key]
        out[key] = out[key] - stats.loadMs
      }
    }
    out.replayLoadMs = stats.loadMs
    out.hits = stats.hits
    out.misses = stats.misses
    if (stats.misses) {
      log(
        `  ${stats.misses} replay misses: ${JSON.stringify(stats.missesByHook)}; e.g. ${stats.missSamples.slice(0, 3).join(' ; ')}`,
      )
    }
  } else {
    out.recordedEntries = stats.entries
    // Main-thread time of the hooks that replay skips, in this record run.
    out.replayedHookSyncMs = Math.round(sum(stats.replayedHooks, 'syncMs'))
  }
  out.generatorMs = Math.round(generatorMs(stats) * 10) / 10
  out.otherTanstackHookSyncMs = Math.round(sum(stats.realHooks, 'syncMs'))
  out.wrappedPlugins = stats.wrappedPlugins.length
  out.wrappedLoaders = stats.wrappedLoaders.length
  return out
}

/** Hash of every file under `dir` (build output comparison). */
function hashDir(dir) {
  const hash = crypto.createHash('sha256')
  const files = []
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else {
        files.push(full)
      }
    }
  }
  if (!fs.existsSync(dir)) {
    return 'missing'
  }
  walk(dir)
  for (const file of files.sort()) {
    hash.update(path.relative(dir, file) + '\0')
    hash.update(fs.readFileSync(file))
    hash.update('\0')
  }
  return hash.digest('hex').slice(0, 16)
}

function startViteDev(dir, { profileDir, inst = instrumentation() } = {}) {
  const prof = profilingEnv(profileDir)
  const spawnedAt = now()
  const child = fork(
    path.join(benchRoot, 'scripts/dev-driver.mjs'),
    [dir, String(PORT)],
    {
      cwd: dir,
      execArgv: [...prof.execArgv, ...inst.execArgv],
      env: {
        ...process.env,
        ...prof.env,
        ...inst.env,
        NODE_ENV: 'development',
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    },
  )
  const output = []
  child.stdout.on('data', (d) => output.push(String(d)))
  child.stderr.on('data', (d) => output.push(String(d)))
  const messages = []
  const waiters = []
  // Each message is delivered to one waitFor() call.
  child.on('message', (msg) => {
    const w = waiters.find((w) => w.type === msg.type)
    if (w) {
      waiters.splice(waiters.indexOf(w), 1)
      w.resolve(msg)
    } else {
      messages.push(msg)
    }
  })
  const exited = new Promise((resolve) => child.on('exit', resolve))
  const waitFor = (type, timeoutMs = 300_000) => {
    const found = messages.findIndex((m) => m.type === type)
    if (found !== -1) {
      return Promise.resolve(messages.splice(found, 1)[0])
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(
            new Error(
              `timeout waiting for ${type}\n${output.join('').slice(-4000)}`,
            ),
          ),
        timeoutMs,
      )
      waiters.push({ type, resolve: (m) => (clearTimeout(timer), resolve(m)) })
      exited.then((code) =>
        reject(
          new Error(
            `dev server exited (${code}) before ${type}\n${output.join('').slice(-4000)}`,
          ),
        ),
      )
    })
  }
  return {
    spawnedAt,
    pid: child.pid,
    output,
    waitFor,
    async memory() {
      child.send({ type: 'mem' })
      return (await waitFor('mem', 60_000)).result
    },
    send: (msg) => child.send(msg),
    async stop() {
      if (child.exitCode === null) {
        child.send({ type: 'stop' })
        const timer = setTimeout(() => child.kill('SIGKILL'), 20_000)
        await exited
        clearTimeout(timer)
      }
    },
  }
}

function binPath(pkg, bin, dir) {
  // Prefer the instance linked into the app (shared with the plugins).
  const linked = dir && path.join(dir, 'node_modules', pkg, 'package.json')
  const pkgJson =
    linked && fs.existsSync(linked)
      ? linked
      : require.resolve(`${pkg}/package.json`)
  const meta = JSON.parse(fs.readFileSync(pkgJson, 'utf8'))
  const rel = typeof meta.bin === 'string' ? meta.bin : meta.bin[bin]
  return path.join(path.dirname(pkgJson), rel)
}

function runCommand(
  cmd,
  cmdArgs,
  { cwd, env = {}, execArgv = [], pollChildren = false },
) {
  return new Promise((resolve, reject) => {
    const t0 = now()
    const child = spawn(process.execPath, [...execArgv, cmd, ...cmdArgs], {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const stopPoll = pollChildren ? pollChildrenRss(child.pid) : () => undefined
    const output = []
    child.stdout.on('data', (d) => output.push(String(d)))
    child.stderr.on('data', (d) => output.push(String(d)))
    child.on('exit', (code) => {
      const ms = now() - t0
      const childPeakRssMb = stopPoll()
      if (code !== 0) {
        reject(
          new Error(
            `${path.basename(cmd)} ${cmdArgs.join(' ')} failed (${code})\n${output.join('').slice(-4000)}`,
          ),
        )
      } else {
        resolve({ ms, output: output.join(''), childPeakRssMb })
      }
    })
  })
}

function waitForPort(port, timeoutMs = 300_000) {
  const t0 = Date.now()
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect(port, '127.0.0.1')
      socket.once('connect', () => {
        socket.destroy()
        resolve(now())
      })
      socket.once('error', () => {
        socket.destroy()
        if (Date.now() - t0 > timeoutMs) {
          reject(new Error(`port ${port} never opened`))
        } else {
          setTimeout(attempt, 10)
        }
      })
    }
    attempt()
  })
}

// ---------------------------------------------------------------------------
// Browser
// ---------------------------------------------------------------------------

let browser
async function getBrowser() {
  if (!browser) {
    const { chromium } = require('@playwright/test')
    browser = await chromium.launch()
  }
  return browser
}

const PROBE_INIT_SCRIPT = `(() => {
  const check = () => {
    const want = sessionStorage.getItem('__perfProbeWant')
    if (!want) return
    const kind = sessionStorage.getItem('__perfProbeKind')
    const el = document.querySelector('[data-probe="' + kind + '"]')
    if (el && el.textContent.includes(want)) {
      sessionStorage.removeItem('__perfProbeWant')
      sessionStorage.setItem('__perfProbeHit', JSON.stringify({ token: want, t: performance.timeOrigin + performance.now() }))
    }
  }
  new MutationObserver(check).observe(document, { subtree: true, childList: true, characterData: true })
})()`

async function newPage() {
  const context = await (await getBrowser()).newContext()
  await context.addInitScript(PROBE_INIT_SCRIPT)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e.message ?? e)))
  let loads = 0
  page.on('load', () => loads++)
  return { context, page, errors, loads: () => loads }
}

/**
 * Loads `url` and waits until the root component has hydrated (or, for SPAs,
 * mounted). Vite may reload the page once its dependency optimizer finds new
 * dependencies; the latest hydration after a quiet period counts.
 */
async function loadUntilHydrated(
  page,
  url,
  { quietMs = 1500, timeoutMs = 300_000 } = {},
) {
  const deadline = Date.now() + timeoutMs
  // Counts document loads only; history API navigations do not fire this.
  let docs = 0
  const onDoc = () => {
    docs++
  }
  page.on('domcontentloaded', onDoc)
  let hydratedAt
  try {
    await page.goto(url, { waitUntil: 'commit', timeout: timeoutMs })
    for (;;) {
      if (Date.now() > deadline) {
        throw new Error(`page never hydrated: ${url}`)
      }
      const t = await page
        .waitForFunction(() => window.__PERF_HYDRATED__, null, {
          timeout: Math.max(1, deadline - Date.now()),
          polling: 20,
        })
        .then((h) => h.jsonValue())
        .catch((error) => {
          // A reload destroys the execution context; keep waiting.
          if (/timeout/i.test(String(error?.message))) {
            throw error
          }
          return undefined
        })
      if (t === undefined) {
        continue
      }
      hydratedAt = t
      const docsAtHit = docs
      await sleep(quietMs)
      if (docs === docsAtHit) {
        break
      }
    }
  } finally {
    page.off('domcontentloaded', onDoc)
  }
  return { hydratedAt, reloads: Math.max(0, docs - 1) }
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

const results = {
  schema: 1,
  label: args.label,
  meta: {},
  workloads: {},
  scenarios: {},
  attribution: {},
  // Record-run details of the floor scenarios (the replay runs are in `scenarios`).
  floor: {},
}

function scenarioEntry(name) {
  results.scenarios[name] ??= { runs: [], metrics: {} }
  return results.scenarios[name]
}

function addSample(name, metrics, runInfo) {
  const entry = scenarioEntry(name)
  entry.runs.push({ ...runInfo, ...metrics })
  for (const [key, value] of Object.entries(metrics)) {
    if (typeof value === 'number') {
      ;(entry.metrics[key] ??= []).push(Math.round(value * 10) / 10)
    }
  }
}

function saveResults() {
  const summarized = summarize(results)
  fs.writeFileSync(
    path.join(outDir, 'results.json'),
    JSON.stringify(summarized, null, 2),
  )
  writeMarkdown(summarized, path.join(outDir, 'summary.md'))
}

async function repeat(name, fn, { runs = RUNS, warmup = WARMUP } = {}) {
  let retries = RETRIES
  for (let i = 0; i < warmup + runs; i++) {
    const quiet = await waitForQuiet()
    const measured = i >= warmup
    log(
      `${name} ${measured ? `run ${i - warmup + 1}/${runs}` : `warmup ${i + 1}/${warmup}`} (others busy ${quiet.busyCores} cores, load1 ${quiet.load1})`,
    )
    const stopWatch = startCpuWatch()
    const metrics = await fn(i)
    const during = stopWatch()
    Object.assign(quiet, during)
    if (during.othersBusyDuring > MAX_BUSY) {
      quiet.flagged = true
      log(
        `  flagged: other processes used ${during.othersBusyDuring} cores during the run`,
      )
    }
    log(
      `  ${Object.entries(metrics)
        .map(([k, v]) => `${k}=${typeof v === 'number' ? v.toFixed(0) : v}`)
        .join(' ')}`,
    )
    if (measured && quiet.flagged && retries > 0) {
      retries--
      log(`  discarded (machine load), repeating; ${retries} retries left`)
      i--
      continue
    }
    if (measured) {
      addSample(name, metrics, quiet)
      saveResults()
    }
  }
}

async function devBrowserRun(variant, { cold, profileDir, replay, mem }) {
  const dir = appDir(variant)
  clean(dir, { cache: cold })
  const { context, page } = await newPage()
  const inst = instrumentation({ replay, mem: mem && 'ipc' })
  const dev = startViteDev(dir, { profileDir, inst })
  const stopPoll = mem ? pollChildrenRss(dev.pid) : undefined
  let result
  try {
    const listening = await dev.waitFor('listening')
    const listenMs = listening.epochMs - dev.spawnedAt
    const url = `http://127.0.0.1:${PORT}/`
    const navStart = now()
    const { hydratedAt, reloads } = await loadUntilHydrated(page, url)
    result = {
      listenMs,
      hydratedMs: hydratedAt - dev.spawnedAt,
      listenToHydratedMs: hydratedAt - navStart,
      reloads,
    }
    if (mem) {
      Object.assign(result, pickMem(await dev.memory()), {
        childPeakRssMb: stopPoll(),
      })
    }
  } finally {
    stopPoll?.()
    await context.close()
    await dev.stop()
  }
  return withReplay(result, inst, ['listenMs', 'hydratedMs'])
}

async function devCompileRun(variant, { profileDir, replay, mem } = {}) {
  const dir = appDir(variant)
  clean(dir)
  const inst = instrumentation({ replay, mem: mem && 'ipc' })
  const dev = startViteDev(dir, { profileDir, inst })
  const stopPoll = mem ? pollChildrenRss(dev.pid) : undefined
  let metrics
  try {
    const listening = await dev.waitFor('listening')
    dev.send({ type: 'compile-all' })
    const { result } = await dev.waitFor('compile-all', 600_000)
    metrics = {
      listenMs: listening.epochMs - dev.spawnedAt,
      compileAllMs: result.totalMs,
    }
    for (const [env, r] of Object.entries(result.envs)) {
      metrics[`${env}Ms`] = r.ms
      metrics[`${env}Modules`] = r.modules
      metrics[`${env}OutputHash`] = r.outputHash
      if (r.errors.length) {
        log(
          `  ${env}: ${r.errors.length} transform errors, first: ${JSON.stringify(r.errors[0])}`,
        )
        metrics[`${env}Errors`] = r.errors.length
      }
    }
    metrics.totalMs = now() - dev.spawnedAt
    if (mem) {
      Object.assign(metrics, pickMem(await dev.memory()), {
        childPeakRssMb: stopPoll(),
      })
    }
  } finally {
    stopPoll?.()
    await dev.stop()
  }
  return withReplay(metrics, inst, ['listenMs', 'totalMs'])
}

async function viteBuildRun(variant, { profileDir, replay, mem } = {}) {
  const dir = appDir(variant)
  clean(dir)
  const prof = profilingEnv(profileDir)
  const inst = instrumentation({ replay, mem: mem && 'exit' })
  const { ms, childPeakRssMb } = await runCommand(
    binPath('vite', 'vite', dir),
    ['build'],
    {
      cwd: dir,
      execArgv: [...prof.execArgv, ...inst.execArgv],
      env: { ...prof.env, ...inst.env, NODE_ENV: 'production' },
      pollChildren: Boolean(mem),
    },
  )
  const metrics = { buildMs: ms, outputHash: hashDir(path.join(dir, 'dist')) }
  if (mem) {
    Object.assign(metrics, pickMem(inst.readMemFile()), { childPeakRssMb })
  }
  return withReplay(metrics, inst, ['buildMs'])
}

// Replay wraps the app's Rsbuild config (the generated config stays as is).
const RSBUILD_REPLAY_CONFIG = `import config from './rsbuild.config.ts'
import { wrapRsbuildConfig } from '../../scripts/replay.mjs'

export default wrapRsbuildConfig(config)
`

async function rsbuildBuildRun(variant, { profileDir, replay, mem } = {}) {
  const dir = appDir(variant)
  clean(dir)
  const prof = profilingEnv(profileDir)
  const inst = instrumentation({ replay, mem: mem && 'exit' })
  const cliArgs = ['build']
  if (replay) {
    fs.writeFileSync(
      path.join(dir, 'rsbuild.perf.config.mjs'),
      RSBUILD_REPLAY_CONFIG,
    )
    cliArgs.push('-c', 'rsbuild.perf.config.mjs')
  }
  const { ms, childPeakRssMb } = await runCommand(
    binPath('@rsbuild/core', 'rsbuild', dir),
    cliArgs,
    {
      cwd: dir,
      execArgv: [...prof.execArgv, ...inst.execArgv],
      env: { ...inst.env, NODE_ENV: 'production' },
      pollChildren: Boolean(mem),
    },
  )
  const metrics = {
    buildMs: ms,
    outputHash: hashDir(path.join(dir, 'dist-rsbuild')),
  }
  if (mem) {
    Object.assign(metrics, pickMem(inst.readMemFile()), { childPeakRssMb })
  }
  return withReplay(metrics, inst, ['buildMs'])
}

async function rsbuildDevRun(variant) {
  const dir = appDir(variant)
  clean(dir)
  const { context, page } = await newPage()
  const t0 = now()
  const child = spawn(
    process.execPath,
    [
      binPath('@rsbuild/core', 'rsbuild', dir),
      'dev',
      '--port',
      String(PORT),
      '--host',
      '127.0.0.1',
    ],
    {
      cwd: dir,
      env: { ...process.env, NODE_ENV: 'development' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  const output = []
  child.stdout.on('data', (d) => output.push(String(d)))
  child.stderr.on('data', (d) => output.push(String(d)))
  const exited = new Promise((resolve) => child.on('exit', resolve))
  try {
    const listenAt = await waitForPort(PORT)
    const { hydratedAt, reloads } = await loadUntilHydrated(
      page,
      `http://127.0.0.1:${PORT}/`,
    )
    return { listenMs: listenAt - t0, hydratedMs: hydratedAt - t0, reloads }
  } catch (error) {
    error.message += '\n' + output.join('').slice(-4000)
    throw error
  } finally {
    await context.close()
    child.kill('SIGTERM')
    const timer = setTimeout(() => child.kill('SIGKILL'), 10_000)
    await exited
    clearTimeout(timer)
  }
}

/**
 * Waits on `page` until the edit that put `token` into the probe shows up:
 * the DOM text for UI probes, the server function's return value for
 * `poll` probes. `write()` saves the file. Returns save → seen in ms.
 */
async function editAndWait({ page, errors, dev }, kind, probe, token, write) {
  if (probe.poll) {
    const savedAt = now()
    write()
    const hitAt = await page.evaluate(async (t) => {
      const deadline = Date.now() + 30_000
      while (Date.now() < deadline) {
        try {
          const fn = window.__perfProbeServerFn
          if (fn && String(await fn()).includes(t)) {
            return performance.timeOrigin + performance.now()
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 5))
      }
      return null
    }, token)
    if (hitAt === null) {
      throw new Error(`${kind}: server function never returned ${token}`)
    }
    return hitAt - savedAt
  }
  await page.evaluate(
    ([k, t]) => {
      sessionStorage.setItem('__perfProbeKind', k)
      sessionStorage.setItem('__perfProbeWant', t)
      sessionStorage.removeItem('__perfProbeHit')
    },
    [kind, token],
  )
  const savedAt = now()
  write()
  const hit = await page
    .waitForFunction(() => sessionStorage.getItem('__perfProbeHit'), null, {
      timeout: 30_000,
      polling: 10,
    })
    .then((h) => h.jsonValue())
    .catch(() => {
      throw new Error(
        `${kind}: DOM never showed ${token}; page errors: ${errors.slice(-3).join(' | ')}\n${dev.output.join('').slice(-3000)}`,
      )
    })
  return JSON.parse(hit).t - savedAt
}

/** Opens the probe's page and waits until the probe can be observed. */
async function openProbe(page, kind, probe) {
  await loadUntilHydrated(page, `http://127.0.0.1:${PORT}${probe.url}`, {
    quietMs: 500,
  })
  if (probe.poll) {
    await page.waitForFunction(
      () => typeof window.__perfProbeServerFn === 'function',
      null,
      { timeout: 30_000 },
    )
  } else {
    await page.waitForSelector(`[data-probe="${kind}"]`, { timeout: 30_000 })
    // Deferred (<Hydrate when={visible()}>) content only hydrates on screen.
    await page.locator(`[data-probe="${kind}"]`).scrollIntoViewIfNeeded()
    await sleep(500)
  }
}

/**
 * HMR edits per probe kind. With `replay` (floor scenario) the edit tokens are
 * deterministic so the replay run sees the recorded file contents; the
 * record run makes enough edits to cover the replay run's retries and keeps
 * no samples.
 */
async function hmrScenario(variant, { replay } = {}) {
  const dir = appDir(variant)
  clean(dir)
  const probes = PROBES[variant]
  const recording = replay?.mode === 'record'
  const prefixName = replay ? `${variant}/floor-hmr` : `${variant}/hmr`
  const originals = new Map(
    Object.values(probes).map((p) => [
      p.file,
      fs.readFileSync(path.join(dir, p.file), 'utf8'),
    ]),
  )
  const inst = instrumentation({ replay })
  const dev = startViteDev(dir, { inst })
  const probePage = await newPage()
  const { page, loads } = probePage
  const edits = HMR_WARMUP + HMR_ITERATIONS
  try {
    await dev.waitFor('listening')
    // Warm the dev server (dependency optimization, first SSR) before editing.
    await loadUntilHydrated(page, `http://127.0.0.1:${PORT}/`)
    for (const [kind, probe] of Object.entries(probes)) {
      const file = path.join(dir, probe.file)
      let current = probe.token
      const prefix = probe.token.replace(/-v0$/, '')
      await openProbe(page, kind, probe)
      let retries = RETRIES * 3
      let seq = 0
      for (let i = 0; i < (recording ? edits + retries : edits); i++) {
        const quiet = recording
          ? { busyCores: 0, flagged: false }
          : await waitForQuiet(500)
        const next = replay
          ? `${prefix}-r${++seq}`
          : `${prefix}-r${i + 1}x${Date.now().toString(36)}`
        const loadsBefore = loads()
        const source = fs.readFileSync(file, 'utf8')
        if (!source.includes(current)) {
          throw new Error(`${probe.file} does not contain ${current}`)
        }
        const stopWatch = startCpuWatch()
        const hitAt = await editAndWait(probePage, kind, probe, next, () =>
          fs.writeFileSync(file, source.replace(current, next)),
        )
        current = next
        const fullReloads = loads() - loadsBefore
        // Let the update settle (late invalidations, re-fetches) before the next edit.
        await sleep(400)
        if (recording) {
          continue
        }
        Object.assign(quiet, stopWatch())
        if (quiet.othersBusyDuring > MAX_BUSY) {
          quiet.flagged = true
        }
        if (i >= HMR_WARMUP && quiet.flagged && retries > 0) {
          retries--
          log(
            `${prefixName}/${kind} edit discarded (machine load ${quiet.othersBusyDuring} cores)`,
          )
          i--
          continue
        }
        if (i >= HMR_WARMUP) {
          addSample(
            `${prefixName}/${kind}`,
            { updateMs: hitAt, fullReloads },
            quiet,
          )
        }
        log(
          `${prefixName}/${kind} ${i < HMR_WARMUP ? 'warmup' : 'iter'} ${i + 1}: ${hitAt.toFixed(1)}ms${fullReloads ? ` (${fullReloads} full reloads)` : ''}`,
        )
      }
      saveResults()
      fs.writeFileSync(file, originals.get(probe.file))
      await sleep(1000)
    }
  } finally {
    for (const [file, content] of originals) {
      fs.writeFileSync(path.join(dir, file), content)
    }
    await probePage.context.close()
    await dev.stop()
  }
  if (replay) {
    const stats = withReplay({}, inst, [])
    log(`${prefixName} ${replay.mode}: ${JSON.stringify(stats)}`)
    results.floor[`${variant}/hmr`] ??= {}
    results.floor[`${variant}/hmr`][replay.mode] = stats
    saveResults()
  }
}

/**
 * Leak check: after a cold start (`/` hydrated, one page per probe open),
 * LEAK_CYCLES edit + revert cycles over the route component, loader, server
 * function and shared module probes, then a GC'd heap/RSS snapshot compared
 * with the one right after startup.
 */
async function leakRun(variant) {
  const dir = appDir(variant)
  clean(dir)
  const kinds = [
    'route-component',
    'route-loader',
    'server-fn',
    'shared-component',
  ].filter((k) => PROBES[variant][k])
  const originals = new Map(
    kinds.map((k) => [
      k,
      fs.readFileSync(path.join(dir, PROBES[variant][k].file), 'utf8'),
    ]),
  )
  const inst = instrumentation({ mem: 'ipc' })
  const dev = startViteDev(dir, { inst })
  const stopPoll = pollChildrenRss(dev.pid)
  const pages = []
  try {
    await dev.waitFor('listening')
    const home = await newPage()
    pages.push(home)
    await loadUntilHydrated(home.page, `http://127.0.0.1:${PORT}/`)
    const byKind = {}
    for (const kind of kinds) {
      byKind[kind] = await newPage()
      pages.push(byKind[kind])
      await openProbe(byKind[kind].page, kind, PROBES[variant][kind])
    }
    await sleep(1000)
    const start = await dev.memory()
    const series = [{ cycle: 0, ...pickMem(start) }]
    const cycleMs = []
    for (let i = 0; i < LEAK_CYCLES; i++) {
      const kind = kinds[i % kinds.length]
      const probe = PROBES[variant][kind]
      const file = path.join(dir, probe.file)
      const original = originals.get(kind)
      const token = probe.token.replace(/-v0$/, `-leak${i + 1}`)
      const t0 = now()
      const target = { ...byKind[kind], dev }
      try {
        await editAndWait(target, kind, probe, token, () =>
          fs.writeFileSync(file, original.replace(probe.token, token)),
        )
        await sleep(200)
        await editAndWait(target, kind, probe, probe.token, () =>
          fs.writeFileSync(file, original),
        )
      } catch (error) {
        error.message = `leak cycle ${i + 1}: ${error.message}`
        throw error
      }
      await sleep(200)
      cycleMs.push(now() - t0)
      if ((i + 1) % 10 === 0 || i === LEAK_CYCLES - 1) {
        series.push({ cycle: i + 1, ...pickMem(await dev.memory()) })
      }
    }
    await sleep(1000)
    const end = await dev.memory()
    const growth = (key) => Math.round((end[key] - start[key]) * 10) / 10
    const errors = pages.reduce((n, p) => n + p.errors.length, 0)
    return {
      cycles: LEAK_CYCLES,
      heapStartMb: start.heapUsedMb,
      heapEndMb: end.heapUsedMb,
      heapGrowthMb: growth('heapUsedMb'),
      rssStartMb: start.rssMb,
      rssEndMb: end.rssMb,
      rssGrowthMb: growth('rssMb'),
      externalGrowthMb: growth('externalMb'),
      arrayBuffersGrowthMb: growth('arrayBuffersMb'),
      peakRssMb: end.peakRssMb,
      childPeakRssMb: stopPoll(),
      cycleMsMedian: [...cycleMs].sort((a, b) => a - b)[cycleMs.length >> 1],
      pageErrors: errors,
      series,
    }
  } finally {
    stopPoll()
    for (const kind of kinds) {
      fs.writeFileSync(
        path.join(dir, PROBES[variant][kind].file),
        originals.get(kind),
      )
    }
    for (const p of pages) {
      await p.context.close()
    }
    await dev.stop()
  }
}

async function memoryScenario(variant) {
  const opts = { runs: MEMORY_RUNS, warmup: 0 }
  await repeat(
    `${variant}/mem-build`,
    () => viteBuildRun(variant, { mem: true }),
    opts,
  )
  await repeat(
    `${variant}/mem-dev-cold`,
    () => devBrowserRun(variant, { cold: true, mem: true }),
    opts,
  )
  await repeat(
    `${variant}/mem-dev-compile`,
    () => devCompileRun(variant, { mem: true }),
    opts,
  )
  if (hasRsbuild(variant)) {
    await repeat(
      `${variant}/mem-rsbuild-build`,
      () => rsbuildBuildRun(variant, { mem: true }),
      opts,
    )
  }
}

/**
 * Floor: per scenario kind, one record run (real compiler, results stored)
 * and then the measured replay runs. Replayed outputs must match the record
 * run's (`outputMismatch`), and misses should be ~0.
 */
async function floorScenario(variant) {
  const runners = {
    build: (o) => viteBuildRun(variant, o),
    'dev-compile': (o) => devCompileRun(variant, o),
    'dev-cold': (o) => devBrowserRun(variant, { cold: true, ...o }),
    'rsbuild-build': (o) => rsbuildBuildRun(variant, o),
  }
  for (const kind of FLOOR_KINDS) {
    if (!floorKinds.has(kind)) {
      continue
    }
    if (kind === 'rsbuild-build' && !hasRsbuild(variant)) {
      continue
    }
    const name = `${variant}-${kind}`
    if (kind === 'hmr') {
      log(`${variant}/floor-hmr record`)
      await hmrScenario(variant, { replay: { mode: 'record', name } })
      await hmrScenario(variant, { replay: { mode: 'replay', name } })
      continue
    }
    await waitForQuiet()
    log(`${variant}/floor-${kind} record run`)
    const recorded = await runners[kind]({ replay: { mode: 'record', name } })
    log(`  recorded: ${JSON.stringify(recorded)}`)
    const hashKeys = Object.keys(recorded).filter((k) => /Hash$/.test(k))
    // The record run must produce what an uninstrumented run produces.
    const realRun = results.scenarios[`${variant}/${kind}`]?.runs.at(-1)
    const realMatches = realRun
      ? hashKeys.every((k) => realRun[k] === recorded[k])
      : undefined
    if (realMatches === false) {
      log(`  record run output differs from the real run's`)
    }
    results.floor[`${variant}/${kind}`] = { record: recorded, realMatches }
    await repeat(`${variant}/floor-${kind}`, async () => {
      const m = await runners[kind]({ replay: { mode: 'replay', name } })
      const mismatched = hashKeys.filter((k) => m[k] !== recorded[k])
      if (mismatched.length) {
        log(`  output differs from the record run: ${mismatched.join(', ')}`)
      }
      m.outputMismatch = mismatched.length
      return m
    })
  }
}

async function profileScenario(variant) {
  const base = path.join(outDir, 'profiles', variant)
  const runs = [
    [
      'dev-compile',
      (profileDir) => devCompileRun(variant, { profileDir }),
      (m) => m.totalMs,
    ],
    [
      'dev-cold',
      (profileDir) => devBrowserRun(variant, { cold: true, profileDir }),
      (m) => m.hydratedMs,
    ],
    [
      'build',
      (profileDir) => viteBuildRun(variant, { profileDir }),
      (m) => m.buildMs,
    ],
  ]
  if (scenarios.has('rsbuild-build') && hasRsbuild(variant)) {
    runs.push([
      'rsbuild-build',
      (profileDir) => rsbuildBuildRun(variant, { profileDir }),
      (m) => m.buildMs,
    ])
  }
  for (const [name, run, wall] of runs) {
    const quiet = await waitForQuiet()
    const profileDir = path.join(base, name)
    log(`${variant}/${name} profiled run (others busy ${quiet.busyCores})`)
    const metrics = await run(profileDir)
    results.attribution[`${variant}/${name}`] = {
      ...readAttribution(profileDir, wall(metrics)),
      metrics,
      quiet,
    }
    saveResults()
  }
}

// ---------------------------------------------------------------------------

function git(argsList) {
  try {
    return execFileSync('git', argsList, {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim()
  } catch {
    return undefined
  }
}

function pkgVersion(name) {
  try {
    return JSON.parse(
      fs.readFileSync(
        path.join(benchRoot, 'node_modules', name, 'package.json'),
        'utf8',
      ),
    ).version
  } catch {
    return undefined
  }
}

async function main() {
  results.meta = {
    startedAt: new Date().toISOString(),
    repoRoot,
    commit: git(['rev-parse', 'HEAD']),
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
    dirty: Boolean(git(['status', '--porcelain', '--', 'packages'])),
    node: process.version,
    platform: `${os.platform()} ${os.release()}`,
    cpu: `${os.cpus()[0]?.model} x${os.cpus().length}`,
    memGb: Math.round(os.totalmem() / 2 ** 30),
    versions: Object.fromEntries(
      [
        'vite',
        '@vitejs/plugin-react',
        '@rsbuild/core',
        '@playwright/test',
        'react',
        ...(variants.some((v) => frameworkOf(v) === 'solid')
          ? ['solid-js', 'vite-plugin-solid']
          : []),
      ].map((n) => [n, pkgVersion(n)]),
    ),
    options: {
      runs: RUNS,
      warmup: WARMUP,
      hmrIterations: HMR_ITERATIONS,
      hmrWarmup: HMR_WARMUP,
      maxBusy: MAX_BUSY,
      memoryRuns: MEMORY_RUNS,
      leakCycles: LEAK_CYCLES,
    },
  }
  log(
    `compiler-perf ${args.label}: ${results.meta.commit} (${results.meta.branch}) node ${process.version} -> ${outDir}`,
  )

  if (!args['skip-package-builds']) {
    log('building packages through Nx')
    execFileSync(
      'pnpm',
      [
        'nx',
        'run-many',
        '-t',
        'build',
        '-p',
        '@tanstack/router-plugin',
        ...new Set(
          variants.flatMap((v) => [
            `@tanstack/${frameworkOf(v)}-router`,
            ...(isStart(v) ? [`@tanstack/${frameworkOf(v)}-start`] : []),
          ]),
        ),
        '--outputStyle=stream',
        '--skipRemoteCache',
      ],
      {
        cwd: repoRoot,
        stdio: 'inherit',
        env: { ...process.env, CI: '1', NX_DAEMON: 'false' },
      },
    )
  }

  for (const variant of variants) {
    const info = writeApp(variant)
    results.meta.shared ??= {}
    results.meta.shared[variant] = Object.fromEntries(
      Object.entries(info.shared).map(([name, target]) => [
        name,
        target && path.relative(repoRoot, target),
      ]),
    )
    results.workloads[variant] = {
      hash: info.hash,
      files: info.fileCount,
      routeFiles: info.routeCount,
      serverFns: info.serverFnCount,
    }
    log(
      `${variant}: generated ${info.fileCount} files (${info.routeCount} route files, ${info.serverFnCount} server fns), hash ${info.hash}`,
    )

    if (scenarios.has('build')) {
      await repeat(`${variant}/build`, () => viteBuildRun(variant))
    }
    if (scenarios.has('dev-compile')) {
      await repeat(`${variant}/dev-compile`, () => devCompileRun(variant))
    }
    if (scenarios.has('dev-cold')) {
      await repeat(`${variant}/dev-cold`, () =>
        devBrowserRun(variant, { cold: true }),
      )
    }
    if (scenarios.has('dev-warm')) {
      // The first (warmup) run fills the dependency cache that later runs reuse.
      await repeat(
        `${variant}/dev-warm`,
        () => devBrowserRun(variant, { cold: false }),
        { warmup: Math.max(1, WARMUP) },
      )
    }
    if (scenarios.has('hmr')) {
      await hmrScenario(variant)
    }
    if (hasRsbuild(variant)) {
      if (scenarios.has('rsbuild-build')) {
        await repeat(`${variant}/rsbuild-build`, () => rsbuildBuildRun(variant))
      }
      if (scenarios.has('rsbuild-dev')) {
        await repeat(`${variant}/rsbuild-dev-cold`, () =>
          rsbuildDevRun(variant),
        )
      }
    }
    if (scenarios.has('floor')) {
      await floorScenario(variant)
    }
    if (scenarios.has('memory')) {
      await memoryScenario(variant)
    }
    if (scenarios.has('leak')) {
      await repeat(`${variant}/leak`, () => leakRun(variant), {
        runs: 1,
        warmup: 0,
      })
    }
    if (scenarios.has('profile')) {
      await profileScenario(variant)
    }
  }
  results.meta.finishedAt = new Date().toISOString()
  saveResults()
  log(
    `done: ${path.join(outDir, 'results.json')}, ${path.join(outDir, 'summary.md')}`,
  )
}

try {
  await main()
} finally {
  await browser?.close()
}
