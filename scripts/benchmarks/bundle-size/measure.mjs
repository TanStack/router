#!/usr/bin/env node

import fs from 'node:fs'
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs as parseNodeArgs } from 'node:util'
import { brotliCompressSync, gzipSync } from 'node:zlib'
import { execSync } from 'node:child_process'

import { build } from 'vite'

const BENCHMARK_NAME = 'Bundle Size (gzip)'

const SCENARIOS = [
  {
    id: 'react-router.minimal',
    dir: 'react-router-minimal',
    framework: 'react',
    packageName: '@tanstack/react-router',
    case: 'minimal',
  },
  {
    id: 'react-router.full',
    dir: 'react-router-full',
    framework: 'react',
    packageName: '@tanstack/react-router',
    case: 'full',
  },
  {
    id: 'solid-router.minimal',
    dir: 'solid-router-minimal',
    framework: 'solid',
    packageName: '@tanstack/solid-router',
    case: 'minimal',
  },
  {
    id: 'solid-router.full',
    dir: 'solid-router-full',
    framework: 'solid',
    packageName: '@tanstack/solid-router',
    case: 'full',
  },
  {
    id: 'vue-router.minimal',
    dir: 'vue-router-minimal',
    framework: 'vue',
    packageName: '@tanstack/vue-router',
    case: 'minimal',
  },
  {
    id: 'vue-router.full',
    dir: 'vue-router-full',
    framework: 'vue',
    packageName: '@tanstack/vue-router',
    case: 'full',
  },
  {
    id: 'react-start.minimal',
    dir: 'react-start-minimal',
    framework: 'react',
    packageName: '@tanstack/react-start',
    case: 'minimal',
  },
  {
    id: 'react-start.full',
    dir: 'react-start-full',
    framework: 'react',
    packageName: '@tanstack/react-start',
    case: 'full',
  },
  {
    id: 'solid-start.minimal',
    dir: 'solid-start-minimal',
    framework: 'solid',
    packageName: '@tanstack/solid-start',
    case: 'minimal',
  },
  {
    id: 'solid-start.full',
    dir: 'solid-start-full',
    framework: 'solid',
    packageName: '@tanstack/solid-start',
    case: 'full',
  },
]

function parseArgs(argv) {
  const { values } = parseNodeArgs({
    args: argv,
    allowPositionals: false,
    strict: true,
    options: {
      sha: { type: 'string' },
      'measured-at': { type: 'string' },
      'append-history': { type: 'string' },
      'results-dir': { type: 'string' },
      'dist-dir': { type: 'string' },
    },
  })

  return {
    sha: values.sha,
    measuredAt: values['measured-at'],
    appendHistory: values['append-history'],
    resultsDir: values['results-dir'],
    distDir: values['dist-dir'],
  }
}

function toIsoDate(value) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${value}`)
  }

  return date.toISOString()
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function parseMaybeDataJs(raw) {
  const trimmed = raw.trim()

  if (trimmed.startsWith('window.BENCHMARK_DATA')) {
    const withoutPrefix = trimmed
      .replace(/^window\.BENCHMARK_DATA\s*=\s*/, '')
      .replace(/;\s*$/, '')
    return JSON.parse(withoutPrefix)
  }

  return JSON.parse(trimmed)
}

function resolveManifestChunkKey(manifest, keyOrFile) {
  if (manifest[keyOrFile]) {
    return keyOrFile
  }

  for (const [key, value] of Object.entries(manifest)) {
    if (value?.file === keyOrFile) {
      return key
    }
  }

  return undefined
}

function collectInitialJsFiles(manifest, entryKey) {
  const visitedKeys = new Set()
  const files = new Set()

  function visitByKey(chunkKey) {
    if (!chunkKey || visitedKeys.has(chunkKey)) {
      return
    }

    visitedKeys.add(chunkKey)
    const chunk = manifest[chunkKey]

    if (!chunk) {
      return
    }

    if (typeof chunk.file === 'string' && chunk.file.endsWith('.js')) {
      files.add(chunk.file)
    }

    for (const imported of chunk.imports || []) {
      const resolvedKey = resolveManifestChunkKey(manifest, imported)
      if (resolvedKey) {
        visitByKey(resolvedKey)
      }
    }
  }

  visitByKey(entryKey)

  return [...files].sort()
}

function bytesForFiles(baseDir, fileList) {
  let rawBytes = 0
  let gzipBytes = 0
  let brotliBytes = 0

  for (const relativeFile of fileList) {
    const fullPath = path.join(baseDir, relativeFile)
    const content = fs.readFileSync(fullPath)

    rawBytes += content.byteLength
    gzipBytes += gzipSync(content).byteLength
    brotliBytes += brotliCompressSync(content).byteLength
  }

  return {
    rawBytes,
    gzipBytes,
    brotliBytes,
  }
}

async function findManifestFiles(rootDir) {
  const manifestPaths = []

  async function visit(currentDir) {
    const entries = await fsp.readdir(currentDir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name)

      if (entry.isDirectory()) {
        await visit(fullPath)
        continue
      }

      if (entry.isFile() && entry.name === 'manifest.json') {
        const parent = path.basename(path.dirname(fullPath))
        if (parent === '.vite') {
          manifestPaths.push(fullPath)
        }
      }
    }
  }

  await visit(rootDir)
  return manifestPaths
}

function rankManifestPath(manifestPath) {
  let score = 0

  if (manifestPath.includes(`${path.sep}client${path.sep}`)) {
    score += 100
  }

  if (manifestPath.includes(`${path.sep}server${path.sep}`)) {
    score -= 100
  }

  return score
}

function pickManifestEntryKey(manifest) {
  const entries = Object.entries(manifest)

  const htmlEntry = entries.find(
    ([key, value]) => key.endsWith('.html') && value?.isEntry,
  )
  if (htmlEntry) {
    return htmlEntry[0]
  }

  const jsEntries = entries.filter(
    ([, value]) =>
      value?.isEntry &&
      typeof value.file === 'string' &&
      value.file.endsWith('.js'),
  )

  const preferredPatterns = [
    /virtual:tanstack-start-client-entry/i,
    /src[\\/]main\./i,
    /src[\\/]client\./i,
    /client/i,
  ]

  for (const pattern of preferredPatterns) {
    const preferred = jsEntries.find(
      ([key, value]) => pattern.test(key) || pattern.test(value.file),
    )

    if (preferred) {
      return preferred[0]
    }
  }

  if (jsEntries.length > 0) {
    return jsEntries[0][0]
  }

  const anyEntry = entries.find(([, value]) => value?.isEntry)
  if (anyEntry) {
    return anyEntry[0]
  }

  return undefined
}

async function resolveManifestAndEntry(outDir, scenarioId) {
  const manifestPaths = await findManifestFiles(outDir)

  if (manifestPaths.length === 0) {
    throw new Error(`No Vite manifest files found for scenario: ${scenarioId}`)
  }

  manifestPaths.sort((a, b) => {
    const scoreDiff = rankManifestPath(b) - rankManifestPath(a)
    if (scoreDiff !== 0) {
      return scoreDiff
    }

    return a.length - b.length
  })

  for (const manifestPath of manifestPaths) {
    const manifest = readJson(manifestPath)
    const entryKey = pickManifestEntryKey(manifest)

    if (!entryKey) {
      continue
    }

    const manifestOutDir = path.dirname(path.dirname(manifestPath))

    return {
      manifest,
      entryKey,
      manifestPath,
      manifestOutDir,
    }
  }

  throw new Error(
    `Could not determine manifest entry for scenario: ${scenarioId}`,
  )
}

function getCurrentSha(providedSha) {
  if (providedSha) {
    return providedSha
  }

  if (process.env.GITHUB_SHA) {
    return process.env.GITHUB_SHA
  }

  return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()
}

function buildCommitUrl(sha) {
  const repo = process.env.GITHUB_REPOSITORY

  if (!repo) {
    return ''
  }

  return `https://github.com/${repo}/commit/${sha}`
}

async function appendHistoryFile({ historyPath, measuredAtIso, sha, benches }) {
  const measuredAtMs = Date.parse(measuredAtIso)
  let writeAsDataJs = historyPath.endsWith('.js')

  let history = {
    lastUpdate: measuredAtMs,
    entries: {},
  }

  if (fs.existsSync(historyPath)) {
    const raw = await fsp.readFile(historyPath, 'utf8')
    writeAsDataJs = raw.trim().startsWith('window.BENCHMARK_DATA')
    history = parseMaybeDataJs(raw)
    history.entries ||= {}
  }

  const entry = {
    commit: {
      id: sha,
      message: `bundle-size snapshot ${sha.slice(0, 12)}`,
      timestamp: measuredAtIso,
      url: buildCommitUrl(sha),
    },
    date: measuredAtMs,
    tool: 'customSmallerIsBetter',
    benches,
  }

  const group = history.entries[BENCHMARK_NAME] || []
  group.push(entry)
  history.entries[BENCHMARK_NAME] = group
  history.lastUpdate = measuredAtMs

  await fsp.mkdir(path.dirname(historyPath), { recursive: true })
  const serialized = JSON.stringify(history, null, 2)
  const output = writeAsDataJs
    ? `window.BENCHMARK_DATA = ${serialized};\n`
    : `${serialized}\n`
  await fsp.writeFile(historyPath, output, 'utf8')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  const scriptDir = path.dirname(fileURLToPath(import.meta.url))
  const repoRoot = path.resolve(scriptDir, '../../../')
  const scenariosRoot = path.join(repoRoot, 'benchmarks/bundle-size/scenarios')
  const resultsDir = args.resultsDir
    ? path.resolve(args.resultsDir)
    : path.join(repoRoot, 'benchmarks/bundle-size/results')
  const distDir = args.distDir
    ? path.resolve(args.distDir)
    : path.join(repoRoot, 'benchmarks/bundle-size/dist')

  const measuredAtIso = args.measuredAt
    ? toIsoDate(args.measuredAt)
    : new Date().toISOString()
  const sha = getCurrentSha(args.sha)

  await fsp.mkdir(resultsDir, { recursive: true })
  await fsp.mkdir(distDir, { recursive: true })

  const metrics = []

  for (const scenario of SCENARIOS) {
    const root = path.join(scenariosRoot, scenario.dir)
    const outDir = path.join(distDir, scenario.dir)
    const configFile = path.join(root, 'vite.config.ts')

    const previousCwd = process.cwd()
    process.chdir(root)

    try {
      await build({
        root,
        configFile,
        logLevel: 'silent',
        define: {
          'process.env.NODE_ENV': '"production"',
        },
        build: {
          outDir,
          emptyOutDir: true,
          target: 'es2022',
          minify: 'esbuild',
          sourcemap: false,
          reportCompressedSize: false,
          manifest: true,
        },
      })
    } finally {
      process.chdir(previousCwd)
    }

    const manifestInfo = await resolveManifestAndEntry(outDir, scenario.id)

    const jsFiles = collectInitialJsFiles(
      manifestInfo.manifest,
      manifestInfo.entryKey,
    )
    const sizes = bytesForFiles(manifestInfo.manifestOutDir, jsFiles)

    metrics.push({
      id: scenario.id,
      scenarioDir: scenario.dir,
      framework: scenario.framework,
      packageName: scenario.packageName,
      case: scenario.case,
      entryKey: manifestInfo.entryKey,
      manifestPath: path.relative(outDir, manifestInfo.manifestPath),
      jsFiles,
      ...sizes,
    })
  }

  const current = {
    schemaVersion: 1,
    benchmarkName: BENCHMARK_NAME,
    measuredAt: measuredAtIso,
    generatedAt: new Date().toISOString(),
    sha,
    metrics,
  }

  const benchmarkActionRows = metrics.map((metric) => ({
    name: metric.id,
    unit: 'bytes',
    value: metric.gzipBytes,
    extra: `raw=${metric.rawBytes}; brotli=${metric.brotliBytes}`,
  }))

  const currentPath = path.join(resultsDir, 'current.json')
  const benchmarkActionPath = path.join(resultsDir, 'benchmark-action.json')

  await fsp.writeFile(
    currentPath,
    JSON.stringify(current, null, 2) + '\n',
    'utf8',
  )
  await fsp.writeFile(
    benchmarkActionPath,
    JSON.stringify(benchmarkActionRows, null, 2) + '\n',
    'utf8',
  )

  if (args.appendHistory) {
    await appendHistoryFile({
      historyPath: path.resolve(args.appendHistory),
      measuredAtIso,
      sha,
      benches: benchmarkActionRows,
    })
  }

  process.stdout.write(
    `Measured ${metrics.length} scenarios. Wrote ${path.relative(repoRoot, currentPath)} and ${path.relative(repoRoot, benchmarkActionPath)}\n`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
