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
import { createRequire } from 'node:module'
import { analyzeCpuProfileDir } from './cpuprofile.mjs'
import { PROBES, VARIANTS, appDir, benchRoot, writeApp } from './generate.mjs'
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
    'max-busy': { type: 'string', default: '4' },
    'quiet-timeout': { type: 'string', default: '1800' },
    'skip-package-builds': { type: 'boolean', default: false },
    port: { type: 'string', default: '4810' },
    help: { type: 'boolean', default: false },
  },
})

if (args.help) {
  console.log(`Usage: node scripts/run.mjs [options]
  --label <name>            result label (default "run")
  --out <dir>               output directory (default results/<label>)
  --variants <list>         ${VARIANTS.join(',')}
  --scenarios <list>        ${ALL_SCENARIOS.join(',')}
  --runs <n>                measured runs for startup/build (default 5)
  --warmup <n>              discarded runs before measuring (default 1)
  --hmr-iterations <n>      measured edits per HMR kind (default 20)
  --hmr-warmup <n>          discarded edits per HMR kind (default 3)
  --max-busy <cores>        wait until other processes use fewer cores (default 4)
  --quiet-timeout <s>       max wait for a quiet machine, then flag the run (default 1800)
  --skip-package-builds     do not run the Nx package builds first`)
  process.exit(0)
}

const RUNS = Number(args.runs)
const WARMUP = Number(args.warmup)
const HMR_ITERATIONS = Number(args['hmr-iterations'])
const HMR_WARMUP = Number(args['hmr-warmup'])
const MAX_BUSY = Number(args['max-busy'])
const QUIET_TIMEOUT_MS = Number(args['quiet-timeout']) * 1000
const PORT = Number(args.port)
const variants = args.variants.split(',').filter(Boolean)
const scenarios = new Set(args.scenarios.split(',').filter(Boolean))
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

function startViteDev(dir, { profileDir } = {}) {
  const prof = profilingEnv(profileDir)
  const spawnedAt = now()
  const child = fork(
    path.join(benchRoot, 'scripts/dev-driver.mjs'),
    [dir, String(PORT)],
    {
      cwd: dir,
      execArgv: prof.execArgv,
      env: { ...process.env, ...prof.env, NODE_ENV: 'development' },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    },
  )
  const output = []
  child.stdout.on('data', (d) => output.push(String(d)))
  child.stderr.on('data', (d) => output.push(String(d)))
  const messages = []
  const waiters = []
  child.on('message', (msg) => {
    messages.push(msg)
    for (const w of [...waiters]) {
      if (w.type === msg.type) {
        waiters.splice(waiters.indexOf(w), 1)
        w.resolve(msg)
      }
    }
  })
  const exited = new Promise((resolve) => child.on('exit', resolve))
  const waitFor = (type, timeoutMs = 300_000) => {
    const found = messages.find((m) => m.type === type)
    if (found) {
      return Promise.resolve(found)
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
    output,
    waitFor,
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

function runCommand(cmd, cmdArgs, { cwd, env = {}, execArgv = [] }) {
  return new Promise((resolve, reject) => {
    const t0 = now()
    const child = spawn(process.execPath, [...execArgv, cmd, ...cmdArgs], {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const output = []
    child.stdout.on('data', (d) => output.push(String(d)))
    child.stderr.on('data', (d) => output.push(String(d)))
    child.on('exit', (code) => {
      const ms = now() - t0
      if (code !== 0) {
        reject(
          new Error(
            `${path.basename(cmd)} ${cmdArgs.join(' ')} failed (${code})\n${output.join('').slice(-4000)}`,
          ),
        )
      } else {
        resolve({ ms, output: output.join('') })
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
  for (let i = 0; i < warmup + runs; i++) {
    const quiet = await waitForQuiet()
    const measured = i >= warmup
    log(
      `${name} ${measured ? `run ${i - warmup + 1}/${runs}` : `warmup ${i + 1}/${warmup}`} (others busy ${quiet.busyCores} cores, load1 ${quiet.load1})`,
    )
    const metrics = await fn(i)
    log(
      `  ${Object.entries(metrics)
        .map(([k, v]) => `${k}=${typeof v === 'number' ? v.toFixed(0) : v}`)
        .join(' ')}`,
    )
    if (measured) {
      addSample(name, metrics, quiet)
      saveResults()
    }
  }
}

async function devBrowserRun(variant, { cold, profileDir }) {
  const dir = appDir(variant)
  clean(dir, { cache: cold })
  const { context, page } = await newPage()
  const dev = startViteDev(dir, { profileDir })
  try {
    const listening = await dev.waitFor('listening')
    const listenMs = listening.epochMs - dev.spawnedAt
    const url = `http://127.0.0.1:${PORT}/`
    const navStart = now()
    const { hydratedAt, reloads } = await loadUntilHydrated(page, url)
    const result = {
      listenMs,
      hydratedMs: hydratedAt - dev.spawnedAt,
      listenToHydratedMs: hydratedAt - navStart,
      reloads,
    }
    return result
  } finally {
    await context.close()
    await dev.stop()
  }
}

async function devCompileRun(variant, { profileDir } = {}) {
  const dir = appDir(variant)
  clean(dir)
  const dev = startViteDev(dir, { profileDir })
  try {
    const listening = await dev.waitFor('listening')
    dev.send({ type: 'compile-all' })
    const { result } = await dev.waitFor('compile-all', 600_000)
    const metrics = {
      listenMs: listening.epochMs - dev.spawnedAt,
      compileAllMs: result.totalMs,
    }
    for (const [env, r] of Object.entries(result.envs)) {
      metrics[`${env}Ms`] = r.ms
      metrics[`${env}Modules`] = r.modules
      if (r.errors.length) {
        log(
          `  ${env}: ${r.errors.length} transform errors, first: ${JSON.stringify(r.errors[0])}`,
        )
        metrics[`${env}Errors`] = r.errors.length
      }
    }
    metrics.totalMs = now() - dev.spawnedAt
    return metrics
  } finally {
    await dev.stop()
  }
}

async function viteBuildRun(variant, { profileDir } = {}) {
  const dir = appDir(variant)
  clean(dir)
  const prof = profilingEnv(profileDir)
  const { ms } = await runCommand(binPath('vite', 'vite', dir), ['build'], {
    cwd: dir,
    execArgv: prof.execArgv,
    env: { ...prof.env, NODE_ENV: 'production' },
  })
  return { buildMs: ms }
}

async function rsbuildBuildRun(variant, { profileDir } = {}) {
  const dir = appDir(variant)
  clean(dir)
  const prof = profilingEnv(profileDir)
  const { ms } = await runCommand(
    binPath('@rsbuild/core', 'rsbuild', dir),
    ['build'],
    {
      cwd: dir,
      execArgv: prof.execArgv,
      env: { NODE_ENV: 'production' },
    },
  )
  return { buildMs: ms }
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

async function hmrScenario(variant) {
  const dir = appDir(variant)
  clean(dir)
  const probes = PROBES[variant]
  const originals = new Map(
    Object.values(probes).map((p) => [
      p.file,
      fs.readFileSync(path.join(dir, p.file), 'utf8'),
    ]),
  )
  const dev = startViteDev(dir)
  const { context, page, errors, loads } = await newPage()
  try {
    await dev.waitFor('listening')
    // Warm the dev server (dependency optimization, first SSR) before editing.
    await loadUntilHydrated(page, `http://127.0.0.1:${PORT}/`)
    for (const [kind, probe] of Object.entries(probes)) {
      const file = path.join(dir, probe.file)
      let current = probe.token
      const prefix = probe.token.replace(/-v0$/, '')
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
        await page.waitForSelector(`[data-probe="${kind}"]`, {
          timeout: 30_000,
        })
        // Deferred (<Hydrate when={visible()}>) content only hydrates on screen.
        await page.locator(`[data-probe="${kind}"]`).scrollIntoViewIfNeeded()
        await sleep(500)
      }
      for (let i = 0; i < HMR_WARMUP + HMR_ITERATIONS; i++) {
        const quiet = await waitForQuiet(500)
        const next = `${prefix}-r${i + 1}x${Date.now().toString(36)}`
        const loadsBefore = loads()
        const source = fs.readFileSync(file, 'utf8')
        if (!source.includes(current)) {
          throw new Error(`${probe.file} does not contain ${current}`)
        }
        let hitAt
        if (probe.poll) {
          const savedAt = now()
          fs.writeFileSync(file, source.replace(current, next))
          hitAt = await page.evaluate(async (token) => {
            const deadline = Date.now() + 30_000
            while (Date.now() < deadline) {
              try {
                const fn = window.__perfProbeServerFn
                if (fn && String(await fn()).includes(token)) {
                  return performance.timeOrigin + performance.now()
                }
              } catch {}
              await new Promise((r) => setTimeout(r, 5))
            }
            return null
          }, next)
          if (hitAt === null) {
            throw new Error(`${kind}: server function never returned ${next}`)
          }
          hitAt -= savedAt
        } else {
          await page.evaluate(
            ([k, t]) => {
              sessionStorage.setItem('__perfProbeKind', k)
              sessionStorage.setItem('__perfProbeWant', t)
              sessionStorage.removeItem('__perfProbeHit')
            },
            [kind, next],
          )
          const savedAt = now()
          fs.writeFileSync(file, source.replace(current, next))
          const hit = await page
            .waitForFunction(
              () => sessionStorage.getItem('__perfProbeHit'),
              null,
              { timeout: 30_000, polling: 10 },
            )
            .then((h) => h.jsonValue())
            .catch(() => {
              throw new Error(
                `${kind}: DOM never showed ${next}; page errors: ${errors.slice(-3).join(' | ')}\n${dev.output.join('').slice(-3000)}`,
              )
            })
          hitAt = JSON.parse(hit).t - savedAt
        }
        current = next
        const fullReloads = loads() - loadsBefore
        if (i >= HMR_WARMUP) {
          addSample(
            `${variant}/hmr/${kind}`,
            { updateMs: hitAt, fullReloads },
            quiet,
          )
        }
        log(
          `${variant}/hmr/${kind} ${i < HMR_WARMUP ? 'warmup' : 'iter'} ${i + 1}: ${hitAt.toFixed(1)}ms${fullReloads ? ` (${fullReloads} full reloads)` : ''}`,
        )
        // Let the update settle (late invalidations, re-fetches) before the next edit.
        await sleep(400)
      }
      saveResults()
      fs.writeFileSync(file, originals.get(probe.file))
      await sleep(1000)
    }
  } finally {
    for (const [file, content] of originals) {
      fs.writeFileSync(path.join(dir, file), content)
    }
    await context.close()
    await dev.stop()
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
  if (scenarios.has('rsbuild') && variant === 'react-start') {
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
      ].map((n) => [n, pkgVersion(n)]),
    ),
    options: {
      runs: RUNS,
      warmup: WARMUP,
      hmrIterations: HMR_ITERATIONS,
      hmrWarmup: HMR_WARMUP,
      maxBusy: MAX_BUSY,
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
        '@tanstack/react-start',
        '@tanstack/router-plugin',
        '@tanstack/react-router',
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
    if (scenarios.has('rsbuild') && variant === 'react-start') {
      await repeat(`${variant}/rsbuild-build`, () => rsbuildBuildRun(variant))
      await repeat(`${variant}/rsbuild-dev-cold`, () => rsbuildDevRun(variant))
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
