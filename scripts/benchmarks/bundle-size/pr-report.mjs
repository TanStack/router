#!/usr/bin/env node

import fs from 'node:fs'
import { promises as fsp } from 'node:fs'
import path from 'node:path'

const DEFAULT_MARKER = '<!-- bundle-size-benchmark -->'
const INT_FORMAT = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
})
const FIXED_2_FORMAT = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const PERCENT_FORMAT = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function parseArgs(argv) {
  const args = {
    current: undefined,
    baseline: undefined,
    history: undefined,
    output: undefined,
    dashboardUrl: undefined,
    baseSha: undefined,
    marker: DEFAULT_MARKER,
    trendPoints: 12,
  }

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (!token.startsWith('--')) {
      continue
    }

    const key = token.slice(2)
    const value = argv[i + 1]

    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for argument: ${token}`)
    }

    switch (key) {
      case 'current':
        args.current = value
        break
      case 'baseline':
        args.baseline = value
        break
      case 'history':
        args.history = value
        break
      case 'output':
        args.output = value
        break
      case 'dashboard-url':
        args.dashboardUrl = value
        break
      case 'base-sha':
        args.baseSha = value
        break
      case 'marker':
        args.marker = value
        break
      case 'trend-points':
        args.trendPoints = Number.parseInt(value, 10)
        if (!Number.isFinite(args.trendPoints) || args.trendPoints < 2) {
          throw new Error(`Invalid trend points: ${value}`)
        }
        break
      default:
        throw new Error(`Unknown argument: ${token}`)
    }

    i += 1
  }

  if (!args.current) {
    throw new Error('Missing required argument: --current')
  }

  if (!args.output) {
    throw new Error('Missing required argument: --output')
  }

  return args
}

function parseMaybeDataJs(raw) {
  const trimmed = raw.trim()

  if (trimmed.startsWith('window.BENCHMARK_DATA')) {
    return JSON.parse(
      trimmed
        .replace(/^window\.BENCHMARK_DATA\s*=\s*/, '')
        .replace(/;\s*$/, ''),
    )
  }

  return JSON.parse(trimmed)
}

function readJsonMaybeData(filePath) {
  return parseMaybeDataJs(fs.readFileSync(filePath, 'utf8'))
}

function formatBytes(bytes, opts = {}) {
  const signed = opts.signed === true

  if (!Number.isFinite(bytes)) {
    return 'n/a'
  }

  const sign = signed && bytes !== 0 ? (bytes > 0 ? '+' : '-') : ''
  const absBytes = Math.abs(bytes)

  let value
  if (absBytes < 1024) {
    value = `${INT_FORMAT.format(absBytes)} B`
  } else {
    const kib = absBytes / 1024
    if (kib < 1024) {
      value = `${FIXED_2_FORMAT.format(kib)} KiB`
    } else {
      const mib = kib / 1024
      value = `${FIXED_2_FORMAT.format(mib)} MiB`
    }
  }

  return `${sign}${value}`
}

function formatDelta(current, baseline) {
  if (!Number.isFinite(current) || !Number.isFinite(baseline)) {
    return 'n/a'
  }

  const delta = current - baseline
  const ratio = baseline === 0 ? 0 : Math.abs(delta / baseline)
  const sign = delta > 0 ? '+' : delta < 0 ? '-' : ''
  return `${formatBytes(delta, { signed: true })} (${sign}${PERCENT_FORMAT.format(ratio)})`
}

function sparkline(values) {
  if (!values.length) {
    return 'n/a'
  }

  const blocks = '▁▂▃▄▅▆▇█'
  const min = Math.min(...values)
  const max = Math.max(...values)

  if (max === min) {
    return '▅'.repeat(values.length)
  }

  return values
    .map((value) => {
      const normalized = (value - min) / (max - min)
      const idx = Math.min(
        blocks.length - 1,
        Math.max(0, Math.round(normalized * (blocks.length - 1))),
      )
      return blocks[idx]
    })
    .join('')
}

function normalizeHistoryEntries(history, benchmarkName) {
  if (!history || typeof history !== 'object' || !history.entries) {
    return []
  }

  const byName = history.entries[benchmarkName]
  if (Array.isArray(byName)) {
    return byName
  }

  const firstEntry = Object.values(history.entries).find((value) =>
    Array.isArray(value),
  )
  return Array.isArray(firstEntry) ? firstEntry : []
}

function buildSeriesByScenario(historyEntries) {
  const map = new Map()

  for (const entry of historyEntries) {
    for (const bench of entry?.benches || []) {
      if (typeof bench?.name !== 'string' || !Number.isFinite(bench?.value)) {
        continue
      }

      if (!map.has(bench.name)) {
        map.set(bench.name, [])
      }

      map.get(bench.name).push(Number(bench.value))
    }
  }

  return map
}

function resolveBaselineFromHistory(historyEntries, baseSha) {
  if (!historyEntries.length) {
    return {
      source: 'none',
      benchesByName: new Map(),
    }
  }

  const baseEntry =
    (baseSha &&
      historyEntries.find(
        (entry) =>
          entry?.commit?.id === baseSha ||
          entry?.commit?.id?.startsWith(baseSha),
      )) ||
    historyEntries[historyEntries.length - 1]

  const benchesByName = new Map()
  for (const bench of baseEntry?.benches || []) {
    if (typeof bench?.name === 'string' && Number.isFinite(bench?.value)) {
      benchesByName.set(bench.name, Number(bench.value))
    }
  }

  const commitId = baseEntry?.commit?.id || 'unknown'

  return {
    source: `history:${commitId.slice(0, 12)}`,
    benchesByName,
  }
}

function resolveBaselineFromCurrentJson(currentJson) {
  const benchesByName = new Map()
  for (const metric of currentJson?.metrics || []) {
    if (typeof metric?.id === 'string' && Number.isFinite(metric?.gzipBytes)) {
      benchesByName.set(metric.id, Number(metric.gzipBytes))
    }
  }

  const sourceSha =
    typeof currentJson?.sha === 'string' ? currentJson.sha : 'unknown'

  return {
    source: `current:${sourceSha.slice(0, 12)}`,
    benchesByName,
  }
}

function formatShortSha(value) {
  if (!value || typeof value !== 'string') {
    return 'unknown'
  }

  return value.slice(0, 12)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const currentPath = path.resolve(args.current)
  const outputPath = path.resolve(args.output)
  const baselinePath = args.baseline ? path.resolve(args.baseline) : undefined
  const historyPath = args.history ? path.resolve(args.history) : undefined

  const current = readJsonMaybeData(currentPath)
  const history =
    historyPath && fs.existsSync(historyPath)
      ? readJsonMaybeData(historyPath)
      : undefined
  const baselineCurrent =
    baselinePath && fs.existsSync(baselinePath)
      ? readJsonMaybeData(baselinePath)
      : undefined

  const historyEntries = normalizeHistoryEntries(history, current.benchmarkName)
  const seriesByScenario = buildSeriesByScenario(historyEntries)

  const baseline =
    baselineCurrent != null
      ? resolveBaselineFromCurrentJson(baselineCurrent)
      : resolveBaselineFromHistory(historyEntries, args.baseSha)

  const rows = []

  for (const metric of current.metrics || []) {
    const baselineValue = baseline.benchesByName.get(metric.id)
    const historySeries = (seriesByScenario.get(metric.id) || []).slice(
      // Reserve one slot for the current metric so the sparkline stays at trendPoints.
      -args.trendPoints + 1,
    )

    if (
      !historySeries.length ||
      historySeries[historySeries.length - 1] !== metric.gzipBytes
    ) {
      historySeries.push(metric.gzipBytes)
    }

    rows.push({
      id: metric.id,
      current: metric.gzipBytes,
      raw: metric.rawBytes,
      brotli: metric.brotliBytes,
      deltaCell: formatDelta(metric.gzipBytes, baselineValue),
      trendCell: sparkline(historySeries.slice(-args.trendPoints)),
    })
  }

  const lines = []
  lines.push(args.marker)
  lines.push('## Bundle Size Benchmarks')
  lines.push('')
  lines.push(`- Commit: \`${formatShortSha(current.sha)}\``)
  lines.push(
    `- Measured at: \`${current.measuredAt || current.generatedAt || 'unknown'}\``,
  )
  lines.push(`- Baseline source: \`${baseline.source}\``)
  if (args.dashboardUrl) {
    lines.push(`- Dashboard: [bundle-size history](${args.dashboardUrl})`)
  }
  lines.push('')
  lines.push(
    '| Scenario | Current (gzip) | Delta vs baseline | Raw | Brotli | Trend |',
  )
  lines.push('| --- | ---: | ---: | ---: | ---: | --- |')

  for (const row of rows) {
    lines.push(
      `| \`${row.id}\` | ${formatBytes(row.current)} | ${row.deltaCell} | ${formatBytes(row.raw)} | ${formatBytes(row.brotli)} | ${row.trendCell} |`,
    )
  }

  lines.push('')
  lines.push(
    '_Trend sparkline is historical gzip bytes ending with this PR measurement; lower is better._',
  )

  const markdown = lines.join('\n') + '\n'
  await fsp.mkdir(path.dirname(outputPath), { recursive: true })
  await fsp.writeFile(outputPath, markdown, 'utf8')

  process.stdout.write(`Wrote PR benchmark report: ${outputPath}\n`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
