import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const schemaVersion = 1
export const benchmarkName = 'Memory Usage (retained heap)'

export interface MemorySample {
  iteration: number
  [key: string]: number
}

export interface ScenarioConfig {
  iterations: number
  warmupIterations: number
  batchSize: number
  [key: string]: number
}

export interface ScenarioMetrics {
  retainedHeapDeltaBytes: number
  retainedHeapBytesPerOperation: number
  retainedHeapSlopeBytesPerOperation: number
  peakHeapUsedBytes: number
  peakRssBytes?: number
  peakExternalBytes?: number
  domNodeDelta?: number
  jsEventListenerDelta?: number
  [key: string]: number | undefined
}

export interface ScenarioResult {
  schemaVersion: number
  id: string
  label: string
  framework: string
  runtime: string
  scenario: string
  measuredAt: string
  generatedAt: string
  durationMs: number
  config: ScenarioConfig
  metrics: ScenarioMetrics
  samples: Array<MemorySample>
}

export interface GitInfo {
  sha?: string
  branch?: string
  dirty: boolean
}

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)
const scenarioResultsDir = path.join(projectRoot, 'results', 'scenarios')

const intFormat = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
})

const fixedFormat = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function readPositiveIntegerEnv(name: string, fallback: number) {
  const raw = process.env[name]
  if (!raw) {
    return fallback
  }

  const value = Number.parseInt(raw, 10)
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, received ${raw}`)
  }

  return value
}

export function readScenarioResults(): Array<ScenarioResult> {
  if (!fs.existsSync(scenarioResultsDir)) {
    return []
  }

  return fs
    .readdirSync(scenarioResultsDir)
    .filter((fileName) => fileName.endsWith('.json'))
    .map((fileName) => {
      const filePath = path.join(scenarioResultsDir, fileName)
      return JSON.parse(fs.readFileSync(filePath, 'utf8')) as ScenarioResult
    })
    .sort((a, b) => a.id.localeCompare(b.id))
}

export function writeScenarioResult(result: ScenarioResult) {
  fs.mkdirSync(scenarioResultsDir, { recursive: true })

  const filePath = path.join(scenarioResultsDir, `${result.id}.json`)
  fs.writeFileSync(filePath, `${JSON.stringify(result, null, 2)}\n`)
  return filePath
}

export function createScenarioResult({
  id,
  label,
  framework,
  runtime,
  scenario,
  config,
  startedAt,
  metrics,
  samples,
}: {
  id: string
  label: string
  framework: string
  runtime: string
  scenario: string
  config: ScenarioConfig
  startedAt: Date
  metrics: ScenarioMetrics
  samples: Array<MemorySample>
}): ScenarioResult {
  return {
    schemaVersion,
    id,
    label,
    framework,
    runtime,
    scenario,
    measuredAt: startedAt.toISOString(),
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    config,
    metrics,
    samples,
  }
}

export function computeSlopeBytesPerOperation<TSample extends MemorySample>(
  samples: Array<TSample>,
  getBytes: (sample: TSample) => number,
) {
  const points = samples
    .map((sample) => ({
      x: sample.iteration,
      y: getBytes(sample),
    }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))

  if (points.length < 2) {
    return 0
  }

  const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length

  let numerator = 0
  let denominator = 0
  for (const point of points) {
    const dx = point.x - meanX
    numerator += dx * (point.y - meanY)
    denominator += dx * dx
  }

  return denominator === 0 ? 0 : numerator / denominator
}

export function formatBytes(
  bytes: number | undefined,
  opts: { signed?: boolean } = {},
) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes)) {
    return 'n/a'
  }

  const signed = opts.signed === true
  const sign = signed && bytes !== 0 ? (bytes > 0 ? '+' : '-') : ''
  const absBytes = Math.abs(bytes)

  if (absBytes < 1024) {
    return `${sign}${intFormat.format(absBytes)} B`
  }

  const kib = absBytes / 1024
  if (kib < 1024) {
    return `${sign}${fixedFormat.format(kib)} KiB`
  }

  return `${sign}${fixedFormat.format(kib / 1024)} MiB`
}

function formatNumber(
  value: number | undefined,
  opts: { signed?: boolean } = {},
) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'n/a'
  }

  const signed = opts.signed === true
  const sign = signed && value !== 0 ? (value > 0 ? '+' : '-') : ''
  return `${sign}${intFormat.format(Math.abs(value))}`
}

export function printScenarioResult(result: ScenarioResult) {
  const { metrics } = result
  const lines = [
    '',
    result.id,
    `  iterations                 ${formatNumber(result.config.iterations)}`,
    `  warmup iterations          ${formatNumber(result.config.warmupIterations)}`,
    `  retained heap delta        ${formatBytes(metrics.retainedHeapDeltaBytes, { signed: true })}`,
    `  retained heap / op         ${formatBytes(metrics.retainedHeapBytesPerOperation)}/op`,
    `  retained heap slope        ${formatBytes(metrics.retainedHeapSlopeBytesPerOperation, { signed: true })}/op`,
    `  peak heap used             ${formatBytes(metrics.peakHeapUsedBytes)}`,
  ]

  if (Number.isFinite(metrics.peakRssBytes)) {
    lines.push(
      `  peak rss                   ${formatBytes(metrics.peakRssBytes)}`,
    )
  }

  if (Number.isFinite(metrics.peakExternalBytes)) {
    lines.push(
      `  peak external              ${formatBytes(metrics.peakExternalBytes)}`,
    )
  }

  if (Number.isFinite(metrics.domNodeDelta)) {
    lines.push(
      `  DOM node delta             ${formatNumber(metrics.domNodeDelta, { signed: true })}`,
    )
  }

  if (Number.isFinite(metrics.jsEventListenerDelta)) {
    lines.push(
      `  JS event listener delta    ${formatNumber(metrics.jsEventListenerDelta, { signed: true })}`,
    )
  }

  lines.push('')
  process.stdout.write(`${lines.join('\n')}\n`)
}

export function getGitInfo(): GitInfo {
  const git = (args: Array<string>) => {
    try {
      return execFileSync('git', args, {
        cwd: projectRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
    } catch {
      return undefined
    }
  }

  const sha = git(['rev-parse', 'HEAD'])
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'])
  const dirty = Boolean(git(['status', '--porcelain']))

  return {
    sha,
    branch,
    dirty,
  }
}

export function toBenchmarkAction(results: Array<ScenarioResult>) {
  return results.map((result) => ({
    name: result.id,
    unit: 'bytes',
    value: Math.max(0, Math.round(result.metrics.retainedHeapDeltaBytes)),
    extra: [
      `slope=${Math.round(result.metrics.retainedHeapSlopeBytesPerOperation)} B/op`,
      `peak_heap=${Math.round(result.metrics.peakHeapUsedBytes)} B`,
      typeof result.metrics.peakRssBytes === 'number' &&
      Number.isFinite(result.metrics.peakRssBytes)
        ? `peak_rss=${Math.round(result.metrics.peakRssBytes)} B`
        : undefined,
    ]
      .filter(Boolean)
      .join('; '),
  }))
}

export function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

export function getProjectRoot() {
  return projectRoot
}
