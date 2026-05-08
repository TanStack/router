#!/usr/bin/env node

import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const defaultOutDir = resolve(rootDir, 'analysis-results/lighthouse-stability')

function parseCliArgs(argv) {
  const result = {
    samples: [],
    outDir: defaultOutDir,
    minRuns: 5,
    maxRuns: 15,
    rerunRuns: 5,
  }

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--') continue
    if (!arg.startsWith('--')) continue

    const key = arg.slice(2)
    const next = argv[index + 1]
    const value = next && !next.startsWith('--') ? next : 'true'
    if (value !== 'true') index++

    if (key === 'samples' || key === 'lighthouse') {
      result.samples = listOfPaths(value)
    } else if (key === 'out-dir') {
      result.outDir = resolve(rootDir, value)
    } else if (key === 'min-runs' || key === 'minRuns') {
      result.minRuns = Number(value)
    } else if (key === 'max-runs' || key === 'maxRuns') {
      result.maxRuns = Number(value)
    } else if (key === 'rerun-runs' || key === 'rerunRuns') {
      result.rerunRuns = Number(value)
    }
  }

  if (!result.samples.length) {
    throw new Error('Pass at least one --samples file')
  }
  if (!Number.isFinite(result.minRuns) || result.minRuns < 1) {
    throw new Error(`Invalid --min-runs "${result.minRuns}"`)
  }
  if (!Number.isFinite(result.maxRuns) || result.maxRuns < result.minRuns) {
    throw new Error(`Invalid --max-runs "${result.maxRuns}"`)
  }
  if (!Number.isFinite(result.rerunRuns) || result.rerunRuns < 1) {
    throw new Error(`Invalid --rerun-runs "${result.rerunRuns}"`)
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

function isComplete(sample) {
  return (
    sample.lighthouseComplete !== false &&
    Number.isFinite(sample.tbtMs) &&
    Number.isFinite(sample.interactiveMs)
  )
}

function metricValue(sample, metric) {
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

function metricStats(samples, metric) {
  const values = samples
    .map((sample) => metricValue(sample, metric))
    .filter((value) => value !== null)
  const p25 = quantile(values, 0.25)
  const p75 = quantile(values, 0.75)

  return {
    n: values.length,
    mean: mean(values),
    trimmedMean: trimmedMean(values),
    median: quantile(values, 0.5),
    p25,
    p75,
    iqr: p25 === null || p75 === null ? null : p75 - p25,
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
  }
}

function threshold(metric, median) {
  if (median === null) return null
  if (metric === 'tbtMs') return Math.max(300, Math.abs(median) * 0.3)
  if (metric === 'interactiveMs') return Math.max(750, Math.abs(median) * 0.25)
  throw new Error(`Unknown stability metric "${metric}"`)
}

function sortRows(a, b) {
  return (
    Number(a.points) - Number(b.points) ||
    Number(a.cpuSlowdown) - Number(b.cpuSlowdown) ||
    String(a.network).localeCompare(String(b.network)) ||
    String(a.cache).localeCompare(String(b.cache)) ||
    String(a.route).localeCompare(String(b.route))
  )
}

function summarizeGroup(samples, options) {
  const first = samples[0]
  const complete = samples.filter(isComplete)
  const tbt = metricStats(complete, 'tbtMs')
  const tti = metricStats(complete, 'interactiveMs')
  const tbtThreshold = threshold('tbtMs', tbt.median)
  const ttiThreshold = threshold('interactiveMs', tti.median)
  const reasons = []

  if (complete.length < options.minRuns) {
    reasons.push(`complete runs ${complete.length} < ${options.minRuns}`)
  }
  if (tbt.iqr !== null && tbtThreshold !== null && tbt.iqr > tbtThreshold) {
    reasons.push(
      `TBT IQR ${Math.round(tbt.iqr)}ms > ${Math.round(tbtThreshold)}ms`,
    )
  }
  if (tti.iqr !== null && ttiThreshold !== null && tti.iqr > ttiThreshold) {
    reasons.push(
      `TTI IQR ${Math.round(tti.iqr)}ms > ${Math.round(ttiThreshold)}ms`,
    )
  }

  const unstable = reasons.length > 0
  const needsRerun = unstable && complete.length < options.maxRuns

  return {
    key: caseKey(first),
    points: samplePoints(first),
    route: first.route,
    cpuSlowdown: first.cpuSlowdown,
    network: first.network,
    cache: first.cache,
    totalRuns: samples.length,
    completeRuns: complete.length,
    failedRuns: samples.length - complete.length,
    unstable,
    needsRerun,
    rerunRuns: needsRerun
      ? Math.min(options.rerunRuns, options.maxRuns - complete.length)
      : 0,
    reasons,
    thresholds: {
      tbtIqrMs: tbtThreshold,
      ttiIqrMs: ttiThreshold,
    },
    metrics: {
      tbtMs: tbt,
      interactiveMs: tti,
    },
  }
}

function createRerunCases(rows) {
  return rows
    .filter((row) => row.needsRerun)
    .map((row) => ({
      points: row.points,
      route: row.route,
      cpuSlowdown: row.cpuSlowdown,
      network: row.network,
      cache: row.cache,
      settings: { points: row.points },
    }))
}

function formatMs(value) {
  return value === null || value === undefined ? '' : `${Math.round(value)}`
}

function createMarkdown(rows, inputs, missing, rerunCases) {
  const unstable = rows.filter((row) => row.unstable)
  const needsRerun = rows.filter((row) => row.needsRerun)
  const lines = [
    '# Lighthouse Stability',
    '',
    `Generated at: ${new Date().toISOString()}`,
    '',
    `Inputs: ${inputs.map((path) => `\`${relative(rootDir, path)}\``).join(', ')}`,
    '',
    `Cells: ${rows.length}; unstable: ${unstable.length}; needing rerun: ${needsRerun.length}; rerun cases written: ${rerunCases.length}.`,
    '',
    'A cell is unstable when TBT IQR is greater than `max(300ms, 30% of median)` or TTI IQR is greater than `max(750ms, 25% of median)`, or when it has fewer than the required complete runs.',
    '',
  ]

  if (missing.length) {
    lines.push(
      `Missing inputs: ${missing
        .map((path) => `\`${relative(rootDir, path)}\``)
        .join(', ')}`,
      '',
    )
  }

  lines.push(
    '| Points | CPU | Network | Cache | Route | Complete | Status | TBT median | TBT IQR | TTI median | TTI IQR | Reasons |',
    '| ---: | ---: | --- | --- | --- | ---: | --- | ---: | ---: | ---: | ---: | --- |',
  )

  for (const row of rows) {
    lines.push(
      [
        row.points,
        `${row.cpuSlowdown}x`,
        row.network,
        row.cache,
        `\`${row.route}\``,
        row.completeRuns,
        row.unstable ? 'unstable' : 'stable',
        formatMs(row.metrics.tbtMs.median),
        formatMs(row.metrics.tbtMs.iqr),
        formatMs(row.metrics.interactiveMs.median),
        formatMs(row.metrics.interactiveMs.iqr),
        row.reasons.join('; '),
      ]
        .join(' | ')
        .replace(/^/, '| ') + ' |',
    )
  }

  return `${lines.join('\n')}\n`
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2))
  await mkdir(args.outDir, { recursive: true })

  const loaded = await loadSamples(args.samples)
  const rows = [...groupSamples(loaded.samples).values()]
    .map((samples) => summarizeGroup(samples, args))
    .sort(sortRows)
  const rerunCases = createRerunCases(rows)
  const summary = {
    generatedAt: new Date().toISOString(),
    inputs: args.samples.map((path) => relative(rootDir, path)),
    missingInputs: loaded.missing.map((path) => relative(rootDir, path)),
    options: {
      minRuns: args.minRuns,
      maxRuns: args.maxRuns,
      rerunRuns: args.rerunRuns,
    },
    totals: {
      samples: loaded.samples.length,
      cells: rows.length,
      unstableCells: rows.filter((row) => row.unstable).length,
      rerunCells: rows.filter((row) => row.needsRerun).length,
    },
    rows,
  }

  await writeFile(
    resolve(args.outDir, 'lighthouse-stability.json'),
    JSON.stringify(summary, null, 2),
  )
  await writeFile(
    resolve(args.outDir, 'lighthouse-rerun-cases.json'),
    JSON.stringify(rerunCases, null, 2),
  )
  await writeFile(
    resolve(args.outDir, 'lighthouse-stability.md'),
    createMarkdown(rows, args.samples, loaded.missing, rerunCases),
  )

  console.log(
    `Analyzed ${loaded.samples.length} Lighthouse samples across ${rows.length} cells; ${rerunCases.length} cells need rerun.`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
