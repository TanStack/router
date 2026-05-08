#!/usr/bin/env node

import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const defaultOutDir = resolve(rootDir, 'analysis-results')

const playwrightMetrics = [
  'initialJsTransferBytes',
  'initialJsEncodedBodyBytes',
  'initialJsGzipBytes',
  'initialJsBrotliBytes',
  'preTriggerJsTransferBytes',
  'deferredJsTransferBytes',
  'triggerLatencyMs',
  'shellInpMs',
  'widgetInpMs',
  'chartInpMs',
  'pageInpMs',
  'fcpMs',
  'lcpMs',
  'cls',
  'ttfbMs',
  'documentTransferBytes',
  'documentEncodedBodyBytes',
  'documentDecodedBodyBytes',
]

const lighthouseMetrics = [
  'performanceScore',
  'tbtMs',
  'fcpMs',
  'lcpMs',
  'cls',
  'speedIndexMs',
  'interactiveMs',
  'totalByteWeightBytes',
  'bootupTimeMs',
  'mainThreadWorkMs',
  'maxPotentialFidMs',
]

const routes = [
  'full',
  'defer-visible',
  'defer-visible-prefetch',
  'defer-runtime-only',
  'ssr-full',
  'ssr-defer-visible',
  'ssr-defer-visible-prefetch',
  'ssr-defer-runtime-only',
  'ssr-defer-interaction',
]

function parseCliArgs(argv) {
  const result = {
    playwright: [
      resolve(rootDir, 'bench-results/primary/samples.json'),
      resolve(rootDir, 'bench-results/validation/samples.json'),
    ],
    lighthouse: [
      resolve(rootDir, 'lighthouse-results/primary/samples.json'),
      resolve(rootDir, 'lighthouse-results/validation/samples.json'),
    ],
    stability: undefined,
    outDir: defaultOutDir,
  }

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--') continue
    if (!arg.startsWith('--')) continue

    const key = arg.slice(2)
    const next = argv[index + 1]
    const value = next && !next.startsWith('--') ? next : 'true'
    if (value !== 'true') index++

    if (key === 'playwright' || key === 'bench') {
      result.playwright = listOfPaths(value)
    } else if (key === 'lighthouse') {
      result.lighthouse = listOfPaths(value)
    } else if (key === 'stability') {
      result.stability = resolve(rootDir, value)
    } else if (key === 'out-dir') {
      result.outDir = resolve(rootDir, value)
    }
  }

  return result
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
  const samples = []
  const missing = []

  for (const path of paths) {
    if (!existsSync(path)) {
      missing.push(path)
      continue
    }
    samples.push(...(await loadSampleFile(path)))
  }

  return { samples, missing }
}

async function loadStability(path) {
  if (!path || !existsSync(path)) return { path, rows: [], missing: path ? [path] : [] }
  const parsed = JSON.parse(await readFile(path, 'utf8'))
  return {
    path,
    rows: Array.isArray(parsed.rows) ? parsed.rows : [],
    missing: [],
  }
}

function samplePoints(sample) {
  return sample.settings?.points ?? sample.points
}

function caseKey(sample, withRoute = true) {
  const parts = [
    `points=${samplePoints(sample)}`,
    `cpuSlowdown=${sample.cpuSlowdown}`,
    `network=${sample.network}`,
    `cache=${sample.cache}`,
  ]

  if (withRoute) parts.push(`route=${sample.route}`)
  return parts.join('|')
}

function sortCaseRows(a, b) {
  return (
    Number(a.points) - Number(b.points) ||
    Number(a.cpuSlowdown) - Number(b.cpuSlowdown) ||
    String(a.network).localeCompare(String(b.network)) ||
    String(a.cache).localeCompare(String(b.cache)) ||
    routes.indexOf(a.route) - routes.indexOf(b.route)
  )
}

function groupSamples(samples) {
  const groups = new Map()
  for (const sample of samples) {
    const key = caseKey(sample)
    const group = groups.get(key) ?? []
    group.push(sample)
    groups.set(key, group)
  }
  return groups
}

function numericValue(sample, metric) {
  const value = sample[metric]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function quantile(values, q) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const position = (sorted.length - 1) * q
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sorted[lower]
  const weight = position - lower
  return sorted[lower] * (1 - weight) + sorted[upper] * weight
}

function mean(values) {
  if (!values.length) return null
  return values.reduce((total, value) => total + value, 0) / values.length
}

function trimmedMean(values) {
  if (values.length < 3) return mean(values)
  const sorted = [...values].sort((a, b) => a - b)
  return mean(sorted.slice(1, -1))
}

function stddev(values) {
  if (values.length < 2) return null
  const avg = mean(values)
  const variance =
    values.reduce((total, value) => total + (value - avg) ** 2, 0) /
    (values.length - 1)
  return Math.sqrt(variance)
}

function seededRandom(seed) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

function medianCi(values) {
  if (!values.length) return [null, null]
  if (values.length < 4) return [quantile(values, 0.25), quantile(values, 0.75)]

  const random = seededRandom(values.length * 2654435761)
  const medians = []
  for (let sampleIndex = 0; sampleIndex < 1000; sampleIndex++) {
    const resample = []
    for (let index = 0; index < values.length; index++) {
      resample.push(values[Math.floor(random() * values.length)])
    }
    medians.push(quantile(resample, 0.5))
  }
  return [quantile(medians, 0.025), quantile(medians, 0.975)]
}

function stats(values) {
  const clean = values.filter((value) => value !== null)
  const avg = mean(clean)
  const sd = stddev(clean)
  const sem = clean.length > 1 && sd !== null ? sd / Math.sqrt(clean.length) : 0
  const [medianCiLow, medianCiHigh] = medianCi(clean)

  return {
    n: clean.length,
    mean: avg,
    trimmedMean: trimmedMean(clean),
    median: quantile(clean, 0.5),
    p25: quantile(clean, 0.25),
    p75: quantile(clean, 0.75),
    p95: quantile(clean, 0.95),
    min: clean.length ? Math.min(...clean) : null,
    max: clean.length ? Math.max(...clean) : null,
    iqr:
      clean.length === 0
        ? null
        : quantile(clean, 0.75) - quantile(clean, 0.25),
    stddev: sd,
    meanCi95Low: avg === null ? null : avg - 1.96 * sem,
    meanCi95High: avg === null ? null : avg + 1.96 * sem,
    medianCi95Low: medianCiLow,
    medianCi95High: medianCiHigh,
  }
}

function summarizeGroups(groups, metrics) {
  const rows = []

  for (const [key, samples] of groups) {
    const first = samples[0]
    const metricsSummary = {}

    for (const metric of metrics) {
      metricsSummary[metric] = stats(
        samples.map((sample) => numericValue(sample, metric)),
      )
    }

    rows.push({
      key,
      points: samplePoints(first),
      cpuSlowdown: first.cpuSlowdown,
      network: first.network,
      cache: first.cache,
      route: first.route,
      runs: samples.length,
      metrics: metricsSummary,
      prefetchBeforeTriggerCount: samples.filter(
        (sample) => sample.prefetchBeforeTrigger,
      ).length,
    })
  }

  return rows.sort(sortCaseRows)
}

function isSsrTableRoute(route) {
  return route.startsWith('ssr-')
}

function fullLookup(rows) {
  const lookup = new Map()
  for (const row of rows) {
    if (row.route !== 'full' && row.route !== 'ssr-full') continue
    const prefix = isSsrTableRoute(row.route) ? 'ssr' : 'chart'
    lookup.set(`${prefix}|${caseKey(row, false)}`, row)
  }
  return lookup
}

function addDeltas(rows, metricNames) {
  const fullRows = fullLookup(rows)

  return rows.map((row) => {
    const prefix = isSsrTableRoute(row.route) ? 'ssr' : 'chart'
    const full = fullRows.get(`${prefix}|${caseKey(row, false)}`)
    const deltas = {}

    for (const metric of metricNames) {
      const current = row.metrics[metric]?.median ?? null
      const baseline = full?.metrics[metric]?.median ?? null
      deltas[metric] =
        current === null || baseline === null ? null : current - baseline
    }

    return {
      ...row,
      deltas,
    }
  })
}

function combineRows(playwrightRows, lighthouseRows, stabilityRows = []) {
  const lighthouseByKey = new Map(
    lighthouseRows.map((row) => [row.key, row]),
  )
  const stabilityByKey = new Map(
    stabilityRows.map((row) => [row.key, row]),
  )

  const keys = new Set([
    ...playwrightRows.map((row) => row.key),
    ...lighthouseRows.map((row) => row.key),
  ])
  const playwrightByKey = new Map(playwrightRows.map((row) => [row.key, row]))

  return [...keys]
    .map((key) => {
      const playwright = playwrightByKey.get(key) ?? null
      const lighthouse = lighthouseByKey.get(key) ?? null
      const base = playwright ?? lighthouse

      return {
        key,
        points: base.points,
        cpuSlowdown: base.cpuSlowdown,
        network: base.network,
        cache: base.cache,
        route: base.route,
        playwright,
        lighthouse,
        stability: stabilityByKey.get(key) ?? null,
      }
    })
    .sort(sortCaseRows)
}

function valueAt(row, source, metric, stat = 'median') {
  const bucket = source === 'playwright' ? row.playwright : row.lighthouse
  return bucket?.metrics?.[metric]?.[stat] ?? null
}

function deltaAt(row, source, metric) {
  const bucket = source === 'playwright' ? row.playwright : row.lighthouse
  return bucket?.deltas?.[metric] ?? null
}

function formatNumber(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return ''
  return value.toFixed(digits)
}

function formatMs(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return ''
  return `${Math.round(value)} ms`
}

function formatSignedMs(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return ''
  const rounded = Math.round(value)
  return `${rounded > 0 ? '+' : ''}${rounded} ms`
}

function formatKb(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return ''
  return `${(value / 1024).toFixed(1)} kB`
}

function formatSignedKb(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return ''
  const kb = value / 1024
  return `${kb > 0 ? '+' : ''}${kb.toFixed(1)} kB`
}

function formatCls(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return ''
  return value.toFixed(3)
}

function toCsvValue(value) {
  if (value === null || value === undefined) return ''
  const stringValue =
    typeof value === 'object' ? JSON.stringify(value) : String(value)
  if (!/[",\n]/.test(stringValue)) return stringValue
  return `"${stringValue.replaceAll('"', '""')}"`
}

const csvColumns = [
  'points',
  'cpuSlowdown',
  'network',
  'cache',
  'route',
  'playwrightRuns',
  'lighthouseRuns',
  'lighthouseStability',
  'lighthouseExtraRuns',
  'lighthouseStabilityReasons',
  'initialJsTransferMedian',
  'initialJsTransferDeltaVsFull',
  'preTriggerJsTransferMedian',
  'deferredJsTransferMedian',
  'triggerLatencyMedian',
  'triggerLatencyP75',
  'shellInpMedian',
  'widgetInpMedian',
  'chartInpMedian',
  'pageInpMedian',
  'playwrightLcpMedian',
  'playwrightClsMedian',
  'documentTransferMedian',
  'documentEncodedBodyMedian',
  'documentDecodedBodyMedian',
  'lighthouseTbtMedian',
  'lighthouseTbtP25',
  'lighthouseTbtP75',
  'lighthouseTbtIqr',
  'lighthouseTbtMin',
  'lighthouseTbtMax',
  'lighthouseTbtTrimmedMean',
  'lighthouseTbtDeltaVsFull',
  'lighthouseMainThreadWorkMedian',
  'lighthouseMainThreadWorkDeltaVsFull',
  'lighthouseBootupMedian',
  'lighthouseBootupDeltaVsFull',
  'lighthouseTtiMedian',
  'lighthouseTtiP25',
  'lighthouseTtiP75',
  'lighthouseTtiIqr',
  'lighthouseTtiMin',
  'lighthouseTtiMax',
  'lighthouseTtiTrimmedMean',
  'lighthouseTtiDeltaVsFull',
  'lighthouseLcpMedian',
  'lighthouseClsMedian',
  'performanceScoreMedian',
]

function combinedCsv(rows) {
  const lines = [csvColumns.join(',')]
  for (const row of rows) {
    const values = {
      points: row.points,
      cpuSlowdown: row.cpuSlowdown,
      network: row.network,
      cache: row.cache,
      route: row.route,
      playwrightRuns: row.playwright?.runs ?? 0,
      lighthouseRuns:
        valueAt(row, 'lighthouse', 'tbtMs', 'n') ?? row.lighthouse?.runs ?? 0,
      lighthouseStability: row.stability
        ? row.stability.unstable
          ? 'unstable'
          : 'stable'
        : '',
      lighthouseExtraRuns: row.stability?.completeRuns
        ? Math.max(0, row.stability.completeRuns - 5)
        : '',
      lighthouseStabilityReasons: row.stability?.reasons?.join('; ') ?? '',
      initialJsTransferMedian: valueAt(
        row,
        'playwright',
        'initialJsTransferBytes',
      ),
      initialJsTransferDeltaVsFull: deltaAt(
        row,
        'playwright',
        'initialJsTransferBytes',
      ),
      preTriggerJsTransferMedian: valueAt(
        row,
        'playwright',
        'preTriggerJsTransferBytes',
      ),
      deferredJsTransferMedian: valueAt(
        row,
        'playwright',
        'deferredJsTransferBytes',
      ),
      triggerLatencyMedian: valueAt(row, 'playwright', 'triggerLatencyMs'),
      triggerLatencyP75: valueAt(
        row,
        'playwright',
        'triggerLatencyMs',
        'p75',
      ),
      shellInpMedian: valueAt(row, 'playwright', 'shellInpMs'),
      widgetInpMedian: valueAt(row, 'playwright', 'widgetInpMs'),
      chartInpMedian: valueAt(row, 'playwright', 'chartInpMs'),
      pageInpMedian: valueAt(row, 'playwright', 'pageInpMs'),
      playwrightLcpMedian: valueAt(row, 'playwright', 'lcpMs'),
      playwrightClsMedian: valueAt(row, 'playwright', 'cls'),
      documentTransferMedian: valueAt(
        row,
        'playwright',
        'documentTransferBytes',
      ),
      documentEncodedBodyMedian: valueAt(
        row,
        'playwright',
        'documentEncodedBodyBytes',
      ),
      documentDecodedBodyMedian: valueAt(
        row,
        'playwright',
        'documentDecodedBodyBytes',
      ),
      lighthouseTbtMedian: valueAt(row, 'lighthouse', 'tbtMs'),
      lighthouseTbtP25: valueAt(row, 'lighthouse', 'tbtMs', 'p25'),
      lighthouseTbtP75: valueAt(row, 'lighthouse', 'tbtMs', 'p75'),
      lighthouseTbtIqr: valueAt(row, 'lighthouse', 'tbtMs', 'iqr'),
      lighthouseTbtMin: valueAt(row, 'lighthouse', 'tbtMs', 'min'),
      lighthouseTbtMax: valueAt(row, 'lighthouse', 'tbtMs', 'max'),
      lighthouseTbtTrimmedMean: valueAt(
        row,
        'lighthouse',
        'tbtMs',
        'trimmedMean',
      ),
      lighthouseTbtDeltaVsFull: deltaAt(row, 'lighthouse', 'tbtMs'),
      lighthouseMainThreadWorkMedian: valueAt(
        row,
        'lighthouse',
        'mainThreadWorkMs',
      ),
      lighthouseMainThreadWorkDeltaVsFull: deltaAt(
        row,
        'lighthouse',
        'mainThreadWorkMs',
      ),
      lighthouseBootupMedian: valueAt(row, 'lighthouse', 'bootupTimeMs'),
      lighthouseBootupDeltaVsFull: deltaAt(
        row,
        'lighthouse',
        'bootupTimeMs',
      ),
      lighthouseTtiMedian: valueAt(row, 'lighthouse', 'interactiveMs'),
      lighthouseTtiP25: valueAt(row, 'lighthouse', 'interactiveMs', 'p25'),
      lighthouseTtiP75: valueAt(row, 'lighthouse', 'interactiveMs', 'p75'),
      lighthouseTtiIqr: valueAt(row, 'lighthouse', 'interactiveMs', 'iqr'),
      lighthouseTtiMin: valueAt(row, 'lighthouse', 'interactiveMs', 'min'),
      lighthouseTtiMax: valueAt(row, 'lighthouse', 'interactiveMs', 'max'),
      lighthouseTtiTrimmedMean: valueAt(
        row,
        'lighthouse',
        'interactiveMs',
        'trimmedMean',
      ),
      lighthouseTtiDeltaVsFull: deltaAt(row, 'lighthouse', 'interactiveMs'),
      lighthouseLcpMedian: valueAt(row, 'lighthouse', 'lcpMs'),
      lighthouseClsMedian: valueAt(row, 'lighthouse', 'cls'),
      performanceScoreMedian: valueAt(row, 'lighthouse', 'performanceScore'),
    }

    lines.push(csvColumns.map((column) => toCsvValue(values[column])).join(','))
  }
  return `${lines.join('\n')}\n`
}

function tableRow(values) {
  return `| ${values.join(' | ')} |`
}

function createPrimaryTable(rows) {
  const filtered = rows.filter(
    (row) => row.network === 'desktop' && row.cache === 'cold',
  )
  const lines = [
    '## Primary Matrix',
    '',
    tableRow([
      'Points',
      'CPU slowdown',
      'Route',
      'Initial JS',
      'Initial JS vs full',
      'Pre-trigger JS',
      'Deferred JS',
      'TBT',
      'TBT vs full',
      'Main thread',
      'Main thread vs full',
      'JS boot-up',
      'TTI',
      'Trigger latency',
      'Shell INP',
      'Widget INP',
    ]),
    tableRow([
      '---:',
      '---:',
      '---',
      '---:',
      '---:',
      '---:',
      '---:',
      '---:',
      '---:',
      '---:',
      '---:',
      '---:',
      '---:',
      '---:',
      '---:',
      '---:',
    ]),
  ]

  for (const row of filtered) {
    lines.push(
      tableRow([
        row.points,
        `${row.cpuSlowdown}x`,
        `\`${row.route}\``,
        formatKb(valueAt(row, 'playwright', 'initialJsTransferBytes')),
        formatSignedKb(deltaAt(row, 'playwright', 'initialJsTransferBytes')),
        formatKb(valueAt(row, 'playwright', 'preTriggerJsTransferBytes')),
        formatKb(valueAt(row, 'playwright', 'deferredJsTransferBytes')),
        formatMs(valueAt(row, 'lighthouse', 'tbtMs')),
        formatSignedMs(deltaAt(row, 'lighthouse', 'tbtMs')),
        formatMs(valueAt(row, 'lighthouse', 'mainThreadWorkMs')),
        formatSignedMs(deltaAt(row, 'lighthouse', 'mainThreadWorkMs')),
        formatMs(valueAt(row, 'lighthouse', 'bootupTimeMs')),
        formatMs(valueAt(row, 'lighthouse', 'interactiveMs')),
        formatMs(valueAt(row, 'playwright', 'triggerLatencyMs')),
        formatMs(valueAt(row, 'playwright', 'shellInpMs')),
        formatMs(
          valueAt(row, 'playwright', 'widgetInpMs') ??
            valueAt(row, 'playwright', 'chartInpMs'),
        ),
      ]),
    )
  }

  return `${lines.join('\n')}\n`
}

function createValidationTable(rows) {
  const filtered = rows.filter((row) => row.network === 'mobile')
  const lines = [
    '## Mobile Network Validation',
    '',
    tableRow([
      'Points',
      'CPU slowdown',
      'Cache',
      'Route',
      'Initial JS',
      'Initial JS vs full',
      'Deferred JS',
      'TBT',
      'TBT vs full',
      'Main thread',
      'Main thread vs full',
      'JS boot-up',
      'TTI',
      'Trigger latency',
      'Shell INP',
      'Widget INP',
    ]),
    tableRow([
      '---:',
      '---:',
      '---',
      '---',
      '---:',
      '---:',
      '---:',
      '---:',
      '---:',
      '---:',
      '---:',
      '---:',
      '---:',
      '---:',
      '---:',
      '---:',
    ]),
  ]

  for (const row of filtered) {
    lines.push(
      tableRow([
        row.points,
        `${row.cpuSlowdown}x`,
        row.cache,
        `\`${row.route}\``,
        formatKb(valueAt(row, 'playwright', 'initialJsTransferBytes')),
        formatSignedKb(deltaAt(row, 'playwright', 'initialJsTransferBytes')),
        formatKb(valueAt(row, 'playwright', 'deferredJsTransferBytes')),
        formatMs(valueAt(row, 'lighthouse', 'tbtMs')),
        formatSignedMs(deltaAt(row, 'lighthouse', 'tbtMs')),
        formatMs(valueAt(row, 'lighthouse', 'mainThreadWorkMs')),
        formatSignedMs(deltaAt(row, 'lighthouse', 'mainThreadWorkMs')),
        formatMs(valueAt(row, 'lighthouse', 'bootupTimeMs')),
        formatMs(valueAt(row, 'lighthouse', 'interactiveMs')),
        formatMs(valueAt(row, 'playwright', 'triggerLatencyMs')),
        formatMs(valueAt(row, 'playwright', 'shellInpMs')),
        formatMs(
          valueAt(row, 'playwright', 'widgetInpMs') ??
            valueAt(row, 'playwright', 'chartInpMs'),
        ),
      ]),
    )
  }

  return `${lines.join('\n')}\n`
}

function summarizeHighSignal(rows) {
  const splitRows = rows.filter(
    (row) =>
      row.route === 'defer-visible' ||
      row.route === 'defer-visible-prefetch',
  )
  const runtimeRows = rows.filter((row) => row.route === 'defer-runtime-only')

  const initialSavings = splitRows
    .map((row) => -deltaAt(row, 'playwright', 'initialJsTransferBytes'))
    .filter((value) => typeof value === 'number' && Number.isFinite(value))
  const runtimeInitialDeltas = runtimeRows
    .map((row) => deltaAt(row, 'playwright', 'initialJsTransferBytes'))
    .filter((value) => typeof value === 'number' && Number.isFinite(value))
  const triggerLatencies = rows
    .filter((row) => row.route !== 'full')
    .map((row) => valueAt(row, 'playwright', 'triggerLatencyMs'))
    .filter((value) => typeof value === 'number' && Number.isFinite(value))
  const tbtDeltas = rows
    .filter((row) => row.route !== 'full')
    .map((row) => deltaAt(row, 'lighthouse', 'tbtMs'))
    .filter((value) => typeof value === 'number' && Number.isFinite(value))

  return [
    '# Deferred Hydration Analysis',
    '',
    `Generated at: ${new Date().toISOString()}`,
    '',
    'The Playwright harness supplies byte, activation, and scripted INP metrics. Lighthouse supplies page-load TBT, TTI, main-thread work, and JS boot-up metrics. Values in the blog tables are medians unless a column explicitly says otherwise.',
    '',
    '## High-Signal Ranges',
    '',
    `- Split deferred routes saved ${formatKb(quantile(initialSavings, 0.5))} median initial JS transfer versus \`/full\` across all matched cases; the p75 saving was ${formatKb(quantile(initialSavings, 0.75))}.`,
    `- \`split={false}\` changed initial JS transfer by ${formatSignedKb(quantile(runtimeInitialDeltas, 0.5))} median versus \`/full\`, which is expected because it defers mount work without deferring chart bytes.`,
    `- Deferred route trigger latency ranged from ${formatMs(quantile(triggerLatencies, 0))} to ${formatMs(quantile(triggerLatencies, 1))}; median was ${formatMs(quantile(triggerLatencies, 0.5))}.`,
    `- Lighthouse TBT deltas versus \`/full\` ranged from ${formatSignedMs(quantile(tbtDeltas, 0))} to ${formatSignedMs(quantile(tbtDeltas, 1))}; negative values mean less page-load blocking than \`/full\`.`,
    '',
  ].join('\n')
}

function createBlogTables(rows) {
  return [
    summarizeHighSignal(rows),
    createPrimaryTable(rows),
    '',
    createValidationTable(rows),
    '',
  ].join('\n')
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2))
  await mkdir(args.outDir, { recursive: true })

  const playwrightLoad = await loadSamples(args.playwright)
  const lighthouseLoad = await loadSamples(args.lighthouse)
  const stabilityLoad = await loadStability(args.stability)

  const playwrightRows = addDeltas(
    summarizeGroups(groupSamples(playwrightLoad.samples), playwrightMetrics),
    playwrightMetrics,
  )
  const lighthouseRows = addDeltas(
    summarizeGroups(groupSamples(lighthouseLoad.samples), lighthouseMetrics),
    lighthouseMetrics,
  )
  const combinedRows = combineRows(
    playwrightRows,
    lighthouseRows,
    stabilityLoad.rows,
  )

  const summary = {
    generatedAt: new Date().toISOString(),
    inputs: {
      playwright: args.playwright.map((path) => relative(rootDir, path)),
      lighthouse: args.lighthouse.map((path) => relative(rootDir, path)),
      missingPlaywright: playwrightLoad.missing.map((path) =>
        relative(rootDir, path),
      ),
      missingLighthouse: lighthouseLoad.missing.map((path) =>
        relative(rootDir, path),
      ),
      stability: stabilityLoad.path ? relative(rootDir, stabilityLoad.path) : null,
      missingStability: stabilityLoad.missing.map((path) =>
        relative(rootDir, path),
      ),
    },
    playwright: {
      samples: playwrightLoad.samples.length,
      groups: playwrightRows,
    },
    lighthouse: {
      samples: lighthouseLoad.samples.length,
      groups: lighthouseRows,
    },
    combined: combinedRows,
  }

  await writeFile(
    resolve(args.outDir, 'summary.json'),
    JSON.stringify(summary, null, 2),
  )
  await writeFile(resolve(args.outDir, 'summary.csv'), combinedCsv(combinedRows))
  await writeFile(
    resolve(args.outDir, 'blog-tables.md'),
    createBlogTables(combinedRows),
  )

  console.log(
    `Analyzed ${playwrightLoad.samples.length} Playwright samples and ${lighthouseLoad.samples.length} Lighthouse samples into ${relative(
      rootDir,
      args.outDir,
    )}`,
  )

  if (playwrightLoad.missing.length || lighthouseLoad.missing.length) {
    console.warn(
      `Missing inputs: ${[
        ...playwrightLoad.missing,
        ...lighthouseLoad.missing,
      ]
        .map((path) => relative(rootDir, path))
        .join(', ')}`,
    )
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
