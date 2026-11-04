#!/usr/bin/env node

// Measures the server output of the Start bundle-size scenarios: bytes
// (total, entry chunk), chunks and modules loaded by the first request to `/`,
// and cold start time (process spawn → first SSR response).
//
//   node scripts/benchmarks/bundle-size/server.mjs --repo-root <checkout> \
//     --dist-dir <dir> --build [--maps-dist-dir <dir> --build-maps] \
//     [--runs 20] [--out <json>] [--baseline <json>]
//
// `--build` builds every Start scenario of <checkout> (client + server: Vite
// `createBuilder().buildApp()` like `vite build`, Rsbuild `build()`) into
// --dist-dir with that checkout's packages, which must be built already.
// `measure.mjs` uses Vite's `build()`, which only builds the client
// environment. `--build-maps` builds again into --maps-dist-dir with source
// maps, only to count the modules bundled into each server chunk.
//
// The dist directory must stay inside the checkout that built it: chunks
// import their external dependencies from the surrounding node_modules.
// Absolute paths of the checkout embedded in the output (route manifest file
// paths) are replaced with `/repo` before measuring, so checkouts at paths of
// different lengths compare equal.
//
// "Loaded chunks" are the server output files Node loads while importing the
// entry and answering `GET /` (module load hook, separate untimed run);
// "modules in loaded chunks" counts the source modules bundled into them (from
// the source maps), which Rolldown evaluates in full and Rspack evaluates on
// first require. Cold start runs wait for a quiet machine (`--max-busy`) and
// repeat runs during which other processes were busy.

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { brotliCompressSync, gzipSync } from 'node:zlib'

const SCENARIOS = [
  { id: 'react-start.minimal', dir: 'react-start-minimal' },
  { id: 'react-start.query-integration', dir: 'react-start-query-integration' },
  {
    id: 'react-start.deferred-hydration',
    dir: 'react-start-deferred-hydration',
  },
  { id: 'react-start.full', dir: 'react-start-full' },
  {
    id: 'react-start.rsbuild.minimal',
    dir: 'react-start-minimal',
    outDir: 'react-start-rsbuild-minimal',
    rsbuild: true,
  },
  {
    id: 'react-start.rsbuild.full',
    dir: 'react-start-full',
    outDir: 'react-start-rsbuild-full',
    rsbuild: true,
  },
  { id: 'solid-start.minimal', dir: 'solid-start-minimal' },
  {
    id: 'solid-start.deferred-hydration',
    dir: 'solid-start-deferred-hydration',
  },
  { id: 'solid-start.full', dir: 'solid-start-full' },
  { id: 'vue-start.minimal', dir: 'vue-start-minimal' },
  { id: 'vue-start.full', dir: 'vue-start-full' },
].map((scenario) => ({ outDir: scenario.dir, ...scenario }))

const CHILD = fileURLToPath(new URL('./server-child.mjs', import.meta.url))
const JS_RE = /\.(?:m|c)?js$/

const { values: args } = parseArgs({
  options: {
    'dist-dir': { type: 'string' },
    'maps-dist-dir': { type: 'string' },
    'repo-root': { type: 'string' },
    scenario: { type: 'string' },
    runs: { type: 'string', default: '20' },
    warmup: { type: 'string', default: '3' },
    'max-busy': { type: 'string', default: '1.5' },
    'quiet-timeout': { type: 'string', default: '3600' },
    out: { type: 'string' },
    baseline: { type: 'string' },
    'no-timing': { type: 'boolean' },
    build: { type: 'boolean' },
    'build-maps': { type: 'boolean' },
  },
})

if (!args['dist-dir']) {
  throw new Error('--dist-dir is required')
}

const distDir = path.resolve(args['dist-dir'])
const mapsDistDir = args['maps-dist-dir']
  ? path.resolve(args['maps-dist-dir'])
  : undefined
const repoRoot = args['repo-root']
  ? path.resolve(args['repo-root'])
  : findRepoRoot(distDir)
const scenariosRoot = path.join(repoRoot, 'benchmarks/bundle-size/scenarios')
const runs = Number(args.runs)
const warmup = Number(args.warmup)
const maxBusy = Number(args['max-busy'])
const quietTimeoutMs = Number(args['quiet-timeout']) * 1000

function findRepoRoot(start) {
  let dir = start
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      return dir
    }
    dir = path.dirname(dir)
  }
  throw new Error(`No pnpm workspace above ${start}`)
}

function listFiles(dir, base = dir) {
  const files = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...listFiles(full, base))
    } else if (entry.isFile()) {
      files.push(path.relative(base, full))
    }
  }
  return files.sort()
}

function normalizedContent(file) {
  const content = fs.readFileSync(file)
  const text = content.toString('latin1')
  if (!text.includes(repoRoot)) {
    return content
  }
  return Buffer.from(text.split(repoRoot).join('/repo'), 'latin1')
}

function sizesOf(file) {
  const content = normalizedContent(file)
  return {
    rawBytes: content.byteLength,
    gzipBytes: gzipSync(content).byteLength,
    brotliBytes: brotliCompressSync(content).byteLength,
  }
}

function sum(items) {
  const total = { rawBytes: 0, gzipBytes: 0, brotliBytes: 0 }
  for (const item of items) {
    total.rawBytes += item.rawBytes
    total.gzipBytes += item.gzipBytes
    total.brotliBytes += item.brotliBytes
  }
  return total
}

function findEntry(serverDir) {
  for (const name of ['server.js', 'server.mjs', 'index.js', 'index.mjs']) {
    if (fs.existsSync(path.join(serverDir, name))) {
      return name
    }
  }
  throw new Error(`No server entry in ${serverDir}`)
}

const BARE_RE =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*|\brequire\s*\(\s*)["']([^"'./][^"']*)["']/g

function externalsOf(serverDir, files) {
  const externals = new Set()
  for (const file of files) {
    const text = fs.readFileSync(path.join(serverDir, file), 'utf8')
    for (const match of text.matchAll(BARE_RE)) {
      if (/^(?:node:|@?[a-z0-9])/i.test(match[1])) {
        externals.add(match[1])
      }
    }
  }
  return [...externals].sort()
}

function moduleSourcesOf(serverDir, file) {
  const mapPath = path.join(serverDir, `${file}.map`)
  if (!fs.existsSync(mapPath)) {
    return undefined
  }
  const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'))
  return (map.sources || []).map((source) =>
    source
      .split(repoRoot)
      .join('/repo')
      .replace(/^.*?\/repo\//, '/repo/'),
  )
}

function runChild(entryPath, trace) {
  return new Promise((resolve, reject) => {
    const started = performance.now()
    const child = spawn(
      process.execPath,
      [CHILD, pathToFileURL(entryPath).href, ...(trace ? ['--trace'] : [])],
      {
        cwd: path.dirname(entryPath),
        env: { ...process.env, NODE_ENV: 'production' },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    let stdout = ''
    let stderr = ''
    let wallMs
    child.stdout.on('data', (chunk) => {
      stdout += chunk
      if (wallMs === undefined && stdout.includes('\n')) {
        wallMs = performance.now() - started
      }
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0 || wallMs === undefined) {
        reject(new Error(`child exited ${code}: ${stderr.slice(-4000)}`))
        return
      }
      resolve({ wallMs, ...JSON.parse(stdout.split('\n')[0]) })
    })
  })
}

// System-wide busy cores (from /proc/stat) over a window.
function readCpu() {
  const line = fs.readFileSync('/proc/stat', 'utf8').split('\n')[0]
  const fields = line.trim().split(/\s+/).slice(1).map(Number)
  const idle = fields[3] + fields[4]
  const total = fields.slice(0, 8).reduce((a, b) => a + b, 0)
  return { busy: total - idle, time: performance.now() }
}

const CLK_TCK = 100

function busyCoresBetween(a, b) {
  return (b.busy - a.busy) / CLK_TCK / ((b.time - a.time) / 1000)
}

async function waitQuiet() {
  const deadline = Date.now() + quietTimeoutMs
  for (;;) {
    const a = readCpu()
    await new Promise((resolve) => setTimeout(resolve, 1000))
    const busy = busyCoresBetween(a, readCpu())
    if (busy < maxBusy) {
      return busy
    }
    if (Date.now() > deadline) {
      return busy
    }
  }
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
}

async function measureTiming(entryPath) {
  const samples = []
  let flaggedRetries = 0
  for (let i = 0; i < warmup + runs; i++) {
    const busyBefore = await waitQuiet()
    const a = readCpu()
    const result = await runChild(entryPath, false)
    const b = readCpu()
    const childCores =
      (result.cpuUserUs + result.cpuSystemUs) / 1e6 / (result.wallMs / 1000)
    const othersBusy = Math.max(0, busyCoresBetween(a, b) - childCores - 0.05)
    if (othersBusy > maxBusy && flaggedRetries < runs) {
      flaggedRetries++
      i--
      continue
    }
    if (i >= warmup) {
      samples.push({
        wallMs: result.wallMs,
        importMs: result.importMs,
        responseMs: result.responseMs,
        busyBefore,
        othersBusy,
        flagged: othersBusy > maxBusy,
      })
    }
  }
  const pick = (key) => samples.map((sample) => sample[key])
  return {
    runs: samples.length,
    flagged: samples.filter((sample) => sample.flagged).length,
    retries: flaggedRetries,
    maxOthersBusy: Math.max(...pick('othersBusy')),
    wallMs: {
      median: median(pick('wallMs')),
      p90: percentile(pick('wallMs'), 0.9),
      min: Math.min(...pick('wallMs')),
    },
    importMs: { median: median(pick('importMs')) },
    responseMs: { median: median(pick('responseMs')) },
    samples,
  }
}

async function measureScenario(scenario) {
  const serverDir = path.join(distDir, scenario.outDir, 'server')
  if (!fs.existsSync(serverDir)) {
    return undefined
  }
  const files = listFiles(serverDir)
  const jsFiles = files.filter((file) => JS_RE.test(file))
  const fileSizes = Object.fromEntries(
    files
      .filter((file) => !file.endsWith('.map'))
      .map((file) => [file, sizesOf(path.join(serverDir, file))]),
  )
  const entry = findEntry(serverDir)
  const entryPath = path.join(serverDir, entry)

  const trace = await runChild(entryPath, true)
  const serverPrefix = pathToFileURL(serverDir).href + '/'
  const loadedChunks = trace.loaded
    .filter((url) => url.startsWith(serverPrefix))
    .map((url) => decodeURIComponent(url.slice(serverPrefix.length)))
    .sort()
  const loadedOutside = trace.loaded.filter(
    (url) => !url.startsWith(serverPrefix) && !url.startsWith('node:'),
  )

  let modules
  const mapsServerDir =
    mapsDistDir && path.join(mapsDistDir, scenario.outDir, 'server')
  if (mapsServerDir && fs.existsSync(mapsServerDir)) {
    const mapJsFiles = listFiles(mapsServerDir).filter((file) =>
      JS_RE.test(file),
    )
    const all = new Set()
    const loaded = new Set()
    const perChunk = {}
    for (const file of mapJsFiles) {
      const sources = moduleSourcesOf(mapsServerDir, file) || []
      perChunk[file] = sources.length
      for (const source of sources) {
        all.add(source)
        if (loadedChunks.includes(file)) {
          loaded.add(source)
        }
      }
    }
    const sameChunks =
      JSON.stringify(mapJsFiles) === JSON.stringify(jsFiles.sort())
    modules = {
      total: all.size,
      inLoadedChunks: loaded.size,
      perChunk,
      sameChunkNamesAsMeasuredBuild: sameChunks,
    }
  }

  const result = {
    id: scenario.id,
    entry,
    files: fileSizes,
    total: sum(Object.values(fileSizes)),
    js: sum(jsFiles.map((file) => fileSizes[file])),
    jsChunks: jsFiles.length,
    entryChunk: fileSizes[entry],
    loadedChunks,
    loadedChunkBytes: sum(loadedChunks.map((file) => fileSizes[file])),
    externalModulesLoaded: loadedOutside.length,
    externalModuleUrls: loadedOutside.map((url) =>
      url.split(pathToFileURL(repoRoot).href).join('/repo'),
    ),
    externals: externalsOf(serverDir, jsFiles),
    modules,
    response: {
      status: trace.status,
      bodyBytes: trace.bodyBytes,
      bodyHash: trace.bodyHash,
    },
  }
  if (!args['no-timing']) {
    result.coldStart = await measureTiming(entryPath)
  }
  return result
}

function filterScenarios() {
  if (!args.scenario) {
    return SCENARIOS
  }
  const requested = new Set(args.scenario.split(','))
  return SCENARIOS.filter((scenario) => requested.has(scenario.id))
}

function fmtDelta(base, cand) {
  const delta = cand - base
  return delta === 0 ? '0' : `${delta > 0 ? '+' : ''}${delta}`
}

function diffTable(base, cand) {
  const lines = [
    '| scenario | total raw | Δ | total gzip | Δ | total brotli | Δ | entry raw | Δ | chunks (loaded/all) | modules in loaded chunks | cold start ms (median) | Δ% |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
  ]
  for (const c of cand.scenarios) {
    const b = base.scenarios.find((s) => s.id === c.id)
    if (!b) {
      continue
    }
    const cs = c.coldStart?.wallMs.median
    const bs = b.coldStart?.wallMs.median
    lines.push(
      [
        c.id,
        c.total.rawBytes,
        fmtDelta(b.total.rawBytes, c.total.rawBytes),
        c.total.gzipBytes,
        fmtDelta(b.total.gzipBytes, c.total.gzipBytes),
        c.total.brotliBytes,
        fmtDelta(b.total.brotliBytes, c.total.brotliBytes),
        c.entryChunk.rawBytes,
        fmtDelta(b.entryChunk.rawBytes, c.entryChunk.rawBytes),
        `${b.loadedChunks.length}/${b.jsChunks} → ${c.loadedChunks.length}/${c.jsChunks}`,
        `${b.modules?.inLoadedChunks ?? '?'} → ${c.modules?.inLoadedChunks ?? '?'}`,
        bs && cs ? `${bs.toFixed(1)} → ${cs.toFixed(1)}` : '',
        bs && cs ? `${(((cs - bs) / bs) * 100).toFixed(1)}%` : '',
      ]
        .join(' | ')
        .replace(/^/, '| ')
        .concat(' |'),
    )
  }
  return lines.join('\n')
}

async function importFrom(dir, specifier) {
  const require = createRequire(path.join(dir, 'package.json'))
  return import(pathToFileURL(require.resolve(specifier)).href)
}

async function buildScenario(scenario, outRoot, sourcemap) {
  const root = path.join(scenariosRoot, scenario.dir)
  const outDir = path.join(outRoot, scenario.outDir)
  const previousCwd = process.cwd()
  process.chdir(root)
  try {
    if (scenario.rsbuild) {
      const { createRsbuild, loadConfig } = await importFrom(
        root,
        '@rsbuild/core',
      )
      process.env.BUNDLE_SIZE_DIST_DIR = outDir
      const { content } = await loadConfig({
        cwd: root,
        path: path.join(root, 'rsbuild.config.ts'),
        envMode: 'production',
      })
      const rsbuild = await createRsbuild({
        cwd: root,
        callerName: 'bundle-size-server-benchmark',
        config: sourcemap
          ? {
              ...content,
              output: { ...content.output, sourceMap: { js: 'source-map' } },
            }
          : content,
      })
      const result = await rsbuild.build()
      await result.close()
      delete process.env.BUNDLE_SIZE_DIST_DIR
      return
    }
    const { createBuilder } = await importFrom(root, 'vite')
    const builder = await createBuilder({
      root,
      configFile: path.join(root, 'vite.config.ts'),
      logLevel: 'silent',
      mode: 'production',
      define: { 'process.env.NODE_ENV': '"production"' },
      build: {
        outDir,
        emptyOutDir: true,
        sourcemap: sourcemap ? 'hidden' : false,
        reportCompressedSize: false,
        manifest: true,
      },
    })
    await builder.buildApp()
  } finally {
    process.chdir(previousCwd)
  }
}

if (args.build || args['build-maps']) {
  process.env.NODE_ENV = 'production'
  for (const scenario of filterScenarios()) {
    if (args.build) {
      fs.rmSync(path.join(distDir, scenario.outDir), {
        recursive: true,
        force: true,
      })
      console.error(`${scenario.id}: building`)
      await buildScenario(scenario, distDir, false)
    }
    if (args['build-maps']) {
      if (!mapsDistDir) {
        throw new Error('--build-maps needs --maps-dist-dir')
      }
      fs.rmSync(path.join(mapsDistDir, scenario.outDir), {
        recursive: true,
        force: true,
      })
      console.error(`${scenario.id}: building with source maps`)
      await buildScenario(scenario, mapsDistDir, true)
    }
  }
}

const scenarios = []
for (const scenario of filterScenarios()) {
  const result = await measureScenario(scenario)
  if (!result) {
    console.error(`${scenario.id}: no server output, skipped`)
    continue
  }
  console.error(
    `${scenario.id}: total ${result.total.rawBytes} raw / ${result.total.gzipBytes} gzip, entry ${result.entryChunk.rawBytes}, loaded ${result.loadedChunks.length}/${result.jsChunks} chunks, status ${result.response.status}` +
      (result.coldStart
        ? `, cold start ${result.coldStart.wallMs.median.toFixed(1)} ms`
        : ''),
  )
  scenarios.push(result)
}

const output = {
  schemaVersion: 1,
  measuredAt: new Date().toISOString(),
  node: process.version,
  distDir,
  repoRoot,
  scenarios,
}

if (args.out) {
  fs.writeFileSync(args.out, JSON.stringify(output, null, 2) + '\n')
}
if (args.baseline) {
  const base = JSON.parse(fs.readFileSync(args.baseline, 'utf8'))
  process.stdout.write(diffTable(base, output) + '\n')
}
