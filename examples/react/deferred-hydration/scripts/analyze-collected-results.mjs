#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const scriptDir = resolve(rootDir, 'scripts')

const requiredLighthouseMetrics = [
  'performanceScore',
  'tbtMs',
  'fcpMs',
  'lcpMs',
  'cls',
  'speedIndexMs',
  'interactiveMs',
  'totalByteWeightBytes',
]

function parseCliArgs(argv) {
  const result = {
    outDir: resolve(rootDir, 'analysis-results/collected'),
    playwright: [
      resolve(rootDir, 'bench-results/primary/samples.json'),
      resolve(rootDir, 'bench-results/validation/samples.json'),
    ],
    lighthouse: [
      resolve(rootDir, 'lighthouse-results/primary/samples.json'),
      firstExisting([
        resolve(rootDir, 'lighthouse-results/validation/samples.json'),
        resolve(rootDir, 'lighthouse-results/validation/samples.partial.ndjson'),
      ]),
    ].filter(Boolean),
  }

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--') continue
    if (!arg.startsWith('--')) continue

    const key = arg.slice(2)
    const next = argv[index + 1]
    const value = next && !next.startsWith('--') ? next : 'true'
    if (value !== 'true') index++

    if (key === 'out-dir') result.outDir = resolve(rootDir, value)
    else if (key === 'playwright') result.playwright = listOfPaths(value)
    else if (key === 'lighthouse') result.lighthouse = listOfPaths(value)
  }

  return result
}

function firstExisting(paths) {
  return paths.find((path) => existsSync(path)) ?? null
}

function listOfPaths(value) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => resolve(rootDir, item))
}

async function loadSampleFile(path) {
  if (!existsSync(path)) return []
  const text = await readFile(path, 'utf8')
  if (!text.trim()) return []

  if (path.endsWith('.ndjson')) {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line))
  }

  const parsed = JSON.parse(text)
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected ${path} to contain a JSON array`)
  }
  return parsed
}

async function loadSamples(paths) {
  const loaded = []
  const missing = []

  for (const path of paths) {
    if (!existsSync(path)) {
      missing.push(path)
      continue
    }
    loaded.push({ path, samples: await loadSampleFile(path) })
  }

  return { loaded, missing }
}

function samplePoints(sample) {
  return sample.settings?.points ?? sample.points
}

function caseKey(sample) {
  return [
    `points=${samplePoints(sample)}`,
    `cpuSlowdown=${sample.cpuSlowdown}`,
    `network=${sample.network}`,
    `cache=${sample.cache}`,
    `route=${sample.route}`,
  ].join('|')
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function missingLighthouseMetrics(sample) {
  return requiredLighthouseMetrics.filter(
    (metric) => !isFiniteNumber(sample[metric]),
  )
}

function isCompleteLighthouseSample(sample) {
  return missingLighthouseMetrics(sample).length === 0
}

function groupQuality(samples) {
  const groups = new Map()

  for (const sample of samples) {
    const key = caseKey(sample)
    const current = groups.get(key) ?? {
      key,
      points: samplePoints(sample),
      cpuSlowdown: sample.cpuSlowdown,
      network: sample.network,
      cache: sample.cache,
      route: sample.route,
      total: 0,
      valid: 0,
      invalid: 0,
      invalidRuns: [],
      missingMetrics: new Map(),
    }

    current.total++
    if (isCompleteLighthouseSample(sample)) {
      current.valid++
    } else {
      current.invalid++
      current.invalidRuns.push(sample.run)
      for (const metric of missingLighthouseMetrics(sample)) {
        current.missingMetrics.set(
          metric,
          (current.missingMetrics.get(metric) ?? 0) + 1,
        )
      }
    }
    groups.set(key, current)
  }

  return [...groups.values()].sort(sortQualityRows)
}

function sortQualityRows(a, b) {
  return (
    Number(a.points) - Number(b.points) ||
    Number(a.cpuSlowdown) - Number(b.cpuSlowdown) ||
    String(a.network).localeCompare(String(b.network)) ||
    String(a.cache).localeCompare(String(b.cache)) ||
    String(a.route).localeCompare(String(b.route))
  )
}

function toRelative(path) {
  return relative(rootDir, path)
}

function tableRow(values) {
  return `| ${values.join(' | ')} |`
}

function createQualityReport({ loaded, missing, validSamples, invalidSamples }) {
  const allSamples = loaded.flatMap((entry) => entry.samples)
  const groups = groupQuality(allSamples)
  const invalidGroups = groups.filter((group) => group.invalid > 0)
  const zeroValidGroups = groups.filter((group) => group.total > 0 && group.valid === 0)

  const lines = [
    '# Collected Benchmark Data Quality',
    '',
    `Generated at: ${new Date().toISOString()}`,
    '',
    'This report is intentionally separate from the benchmark raw output. It documents which collected Lighthouse rows were complete enough to analyze.',
    '',
    '## Inputs',
    '',
    ...loaded.map(
      (entry) =>
        `- ${toRelative(entry.path)}: ${entry.samples.length} Lighthouse rows`,
    ),
    ...missing.map((path) => `- Missing: ${toRelative(path)}`),
    '',
    '## Lighthouse Row Filtering',
    '',
    `- Complete Lighthouse rows kept: ${validSamples.length}`,
    `- Incomplete Lighthouse rows dropped: ${invalidSamples.length}`,
    `- Required metrics: ${requiredLighthouseMetrics.map((metric) => `\`${metric}\``).join(', ')}`,
    '',
    invalidSamples.length
      ? 'Incomplete rows are not treated as zero. In this run the representative report files show Lighthouse `NO_FCP` page-load errors, which make TBT, TTI, FCP, LCP, CLS, and related audits unavailable.'
      : 'No incomplete Lighthouse rows were present in this analysis run.',
    '',
    '## Groups With Dropped Lighthouse Rows',
    '',
  ]

  if (!invalidGroups.length) {
    lines.push('No incomplete Lighthouse rows were found.', '')
  } else {
    lines.push(
      tableRow([
        'Points',
        'CPU',
        'Network',
        'Cache',
        'Route',
        'Valid',
        'Dropped',
        'Dropped runs',
        'Missing metrics',
      ]),
      tableRow([
        '---:',
        '---:',
        '---',
        '---',
        '---',
        '---:',
        '---:',
        '---',
        '---',
      ]),
    )

    for (const group of invalidGroups) {
      lines.push(
        tableRow([
          group.points,
          `${group.cpuSlowdown}x`,
          group.network,
          group.cache,
          `\`${group.route}\``,
          group.valid,
          group.invalid,
          group.invalidRuns.join(', '),
          [...group.missingMetrics.entries()]
            .map(([metric, count]) => `${metric} (${count})`)
            .join(', '),
        ]),
      )
    }
    lines.push('')
  }

  lines.push('## Groups With No Usable Lighthouse Rows', '')
  if (!zeroValidGroups.length) {
    lines.push('Every collected Lighthouse group has at least one complete row.', '')
  } else {
    for (const group of zeroValidGroups) {
      lines.push(
        `- points=${group.points}, cpuSlowdown=${group.cpuSlowdown}x, network=${group.network}, cache=${group.cache}, route=${group.route}`,
      )
    }
    lines.push('')
  }

  return `${lines.join('\n')}\n`
}

function runCommand(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: 'inherit',
      shell: false,
    })

    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`${command} ${args.join(' ')} exited with ${code}`))
    })
  })
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2))
  await mkdir(args.outDir, { recursive: true })

  const lighthouseLoad = await loadSamples(args.lighthouse)
  const lighthouseSamples = lighthouseLoad.loaded.flatMap((entry) => entry.samples)
  const validLighthouseSamples = lighthouseSamples.filter(
    isCompleteLighthouseSample,
  )
  const invalidLighthouseSamples = lighthouseSamples.filter(
    (sample) => !isCompleteLighthouseSample(sample),
  )

  const filteredDir = resolve(args.outDir, 'filtered-inputs')
  await mkdir(filteredDir, { recursive: true })
  const filteredLighthousePath = resolve(filteredDir, 'lighthouse-valid.json')
  await writeFile(
    filteredLighthousePath,
    JSON.stringify(validLighthouseSamples, null, 2),
  )

  await runCommand(process.execPath, [
    resolve(scriptDir, 'analyze-results.mjs'),
    '--playwright',
    args.playwright.join(','),
    '--lighthouse',
    filteredLighthousePath,
    '--out-dir',
    args.outDir,
  ])

  await writeFile(
    resolve(args.outDir, 'data-quality.md'),
    createQualityReport({
      loaded: lighthouseLoad.loaded,
      missing: lighthouseLoad.missing,
      validSamples: validLighthouseSamples,
      invalidSamples: invalidLighthouseSamples,
    }),
  )

  console.log(
    `Filtered Lighthouse rows: kept ${validLighthouseSamples.length}, dropped ${invalidLighthouseSamples.length}`,
  )
  console.log(`Wrote collected-data analysis to ${toRelative(args.outDir)}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
