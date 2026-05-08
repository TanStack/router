#!/usr/bin/env node

import { chromium } from '@playwright/test'
import lighthouse from 'lighthouse'
import { createWriteStream, existsSync } from 'node:fs'
import {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import net from 'node:net'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const defaultOutDir = resolve(rootDir, 'lighthouse-results')

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

const suites = {
  primary: {
    points: [200, 1000, 3000],
    cpuSlowdown: [1, 4, 6],
    network: ['desktop'],
    cache: ['cold'],
  },
  validation: {
    points: [1000, 3000],
    cpuSlowdown: [4, 6],
    network: ['mobile'],
    cache: ['cold', 'warm'],
  },
}

const networkProfiles = {
  desktop: {
    label: 'No network throttle',
    viewport: { width: 1280, height: 900, deviceScaleFactor: 1 },
    lighthouseNetwork: {
      rttMs: 0,
      throughputKbps: 102400,
      requestLatencyMs: 0,
      downloadThroughputKbps: 102400,
      uploadThroughputKbps: 102400,
    },
  },
  mobile: {
    label: 'Mobile network + viewport',
    viewport: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true },
    lighthouseNetwork: {
      rttMs: 150,
      throughputKbps: 1600,
      requestLatencyMs: 150,
      downloadThroughputKbps: 1600,
      uploadThroughputKbps: 750,
    },
  },
}

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
    runs: 10,
    points: undefined,
    cpuSlowdown: undefined,
    network: undefined,
    cache: undefined,
    routes: undefined,
    suite: 'primary',
    outDir: defaultOutDir,
    reportSamples: true,
    skipBuild: false,
    retries: 2,
    caseList: undefined,
  }

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--') continue
    if (!arg.startsWith('--')) continue

    const key = arg.slice(2)
    const next = argv[index + 1]
    const value = next && !next.startsWith('--') ? next : 'true'
    if (value !== 'true') index++

    if (key === 'runs') result.runs = Number(value)
    else if (key === 'points') result.points = listOfNumbers(value)
    else if (key === 'cpu-slowdown' || key === 'cpuSlowdown') {
      result.cpuSlowdown = listOfNumbers(value)
    } else if (key === 'network' || key === 'network-profile') {
      result.network = listOfStrings(value)
    } else if (key === 'cache') result.cache = listOfStrings(value)
    else if (key === 'routes') result.routes = listOfStrings(value)
    else if (key === 'suite') result.suite = value
    else if (key === 'out-dir') result.outDir = resolve(rootDir, value)
    else if (key === 'report-samples') result.reportSamples = value !== 'false'
    else if (key === 'skip-build') result.skipBuild = value !== 'false'
    else if (key === 'retries') result.retries = Number(value)
    else if (key === 'case-list' || key === 'cases') {
      result.caseList = resolve(rootDir, value)
    }
  }

  const suite = result.suite ? suites[result.suite] : undefined
  if (result.suite && !suite) {
    throw new Error(`Unknown suite "${result.suite}"`)
  }

  return {
    ...result,
    points: result.points ?? suite?.points ?? [1000],
    cpuSlowdown: result.cpuSlowdown ?? suite?.cpuSlowdown ?? [1],
    network: expandAll(
      result.network ?? suite?.network ?? ['desktop'],
      Object.keys(networkProfiles),
    ),
    cache: expandAll(result.cache ?? suite?.cache ?? ['cold'], [
      'cold',
      'warm',
    ]),
    routes: expandAll(result.routes ?? routes, routes),
  }
}

function missingLighthouseMetrics(sample) {
  return requiredLighthouseMetrics.filter((metric) => {
    const value = sample[metric]
    return typeof value !== 'number' || !Number.isFinite(value)
  })
}

function isCompleteLighthouseSample(sample) {
  return missingLighthouseMetrics(sample).length === 0
}

async function loadCaseList(path) {
  const parsed = JSON.parse(await readFile(path, 'utf8'))
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected case list ${path} to contain a JSON array`)
  }

  return parsed.map((item, index) => normalizeCase(item, index, path))
}

function normalizeCase(item, index, path) {
  const points = Number(item.points ?? item.settings?.points)
  const cpuSlowdown = Number(item.cpuSlowdown ?? item.cpu_slowdown)
  const route = String(item.route ?? '')
  const network = String(item.network ?? 'desktop')
  const cache = String(item.cache ?? 'cold')

  if (!Number.isFinite(points)) {
    throw new Error(`Invalid points in ${path} case ${index + 1}`)
  }
  if (!Number.isFinite(cpuSlowdown) || cpuSlowdown < 1) {
    throw new Error(`Invalid CPU slowdown in ${path} case ${index + 1}`)
  }
  if (!routes.includes(route)) {
    throw new Error(`Invalid route "${route}" in ${path} case ${index + 1}`)
  }
  if (!networkProfiles[network]) {
    throw new Error(`Invalid network "${network}" in ${path} case ${index + 1}`)
  }
  if (cache !== 'cold' && cache !== 'warm') {
    throw new Error(`Invalid cache "${cache}" in ${path} case ${index + 1}`)
  }

  return {
    points,
    route,
    cpuSlowdown,
    network,
    cache,
    settings: { points },
  }
}

function createMatrixCases(args) {
  const cases = []

  for (const points of args.points) {
    for (const cpuSlowdown of args.cpuSlowdown) {
      if (!Number.isFinite(cpuSlowdown) || cpuSlowdown < 1) {
        throw new Error(`Invalid CPU slowdown "${cpuSlowdown}"`)
      }
      for (const network of args.network) {
        if (!networkProfiles[network]) {
          throw new Error(`Unknown network profile "${network}"`)
        }
        for (const cache of args.cache) {
          for (const route of args.routes) {
            if (!routes.includes(route)) {
              throw new Error(`Unknown route "${route}"`)
            }
            cases.push({
              points,
              route,
              cpuSlowdown,
              network,
              cache,
              settings: { points },
            })
          }
        }
      }
    }
  }

  return cases
}

function expandAll(values, allValues) {
  return values.includes('all') || values.includes('both') ? allValues : values
}

function listOfStrings(value) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function listOfNumbers(value) {
  return listOfStrings(value).map((item) => Number(item))
}

function runCommand(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: 'inherit',
      shell: false,
      ...options,
    })

    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise()
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with ${code}`))
      }
    })
  })
}

function getAvailablePort() {
  return new Promise((resolvePromise, reject) => {
    const server = net.createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new Error('Unable to allocate a port'))
        return
      }
      const port = address.port
      server.close(() => resolvePromise(port))
    })
  })
}

async function waitForServer(url, child) {
  const startedAt = Date.now()
  let lastError

  while (Date.now() - startedAt < 60_000) {
    if (child.exitCode !== null) {
      throw new Error(`Preview server exited with ${child.exitCode}`)
    }

    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch (error) {
      lastError = error
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250))
  }

  throw new Error(`Timed out waiting for ${url}: ${lastError}`)
}

async function startPreviewServer() {
  const port = await getAvailablePort()
  const serverLog = []
  const child = spawn(
    'pnpm',
    [
      'exec',
      'srvx',
      '--prod',
      '--dir=.',
      '-s',
      'dist/client',
      '--entry',
      'dist/server/server.js',
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
    ],
    {
      cwd: rootDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    },
  )

  const captureServerOutput = (chunk) => {
    const text = chunk.toString()
    serverLog.push(text)
    if (serverLog.length > 40) serverLog.shift()
    if (process.env.DEFER_HYDRATION_BENCH_SERVER_LOGS === '1') {
      process.stdout.write(chunk)
    }
  }

  child.stdout.on('data', captureServerOutput)
  child.stderr.on('data', captureServerOutput)

  const baseUrl = `http://127.0.0.1:${port}`
  try {
    await waitForServer(baseUrl, child)
  } catch (error) {
    process.stderr.write(serverLog.join(''))
    child.kill('SIGTERM')
    throw error
  }

  return {
    baseUrl,
    async stop() {
      child.kill('SIGTERM')
      await new Promise((resolvePromise) => {
        child.once('exit', resolvePromise)
        setTimeout(resolvePromise, 1500)
      })
    },
  }
}

async function waitForChrome(port, child) {
  const startedAt = Date.now()
  let lastError

  while (Date.now() - startedAt < 30_000) {
    if (child.exitCode !== null) {
      throw new Error(`Chrome exited with ${child.exitCode}`)
    }

    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (response.ok) return
    } catch (error) {
      lastError = error
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100))
  }

  throw new Error(`Timed out waiting for Chrome: ${lastError}`)
}

async function startChrome() {
  const port = await getAvailablePort()
  const userDataDir = await mkdtemp(join(tmpdir(), 'dh-lighthouse-'))
  const child = spawn(
    chromium.executablePath(),
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      '--headless=new',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-extensions',
      '--no-default-browser-check',
      '--no-first-run',
      '--no-sandbox',
    ],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    },
  )

  try {
    await waitForChrome(port, child)
  } catch (error) {
    child.kill('SIGTERM')
    await rm(userDataDir, { recursive: true, force: true })
    throw error
  }

  return {
    port,
    async stop() {
      child.kill('SIGTERM')
      await new Promise((resolvePromise) => {
        child.once('exit', resolvePromise)
        setTimeout(resolvePromise, 1500)
      })
      await rm(userDataDir, { recursive: true, force: true })
    },
  }
}

function urlForCase(baseUrl, route, settings) {
  const url = new URL(`/${route}`, baseUrl)
  url.searchParams.set('points', String(settings.points))
  return url.href
}

function lighthouseFlags(caseInfo, chromePort) {
  const profile = networkProfiles[caseInfo.network]
  const viewport = profile.viewport

  return {
    port: chromePort,
    hostname: '127.0.0.1',
    logLevel: 'error',
    output: 'json',
    onlyCategories: ['performance'],
    maxWaitForLoad: 60_000,
    disableStorageReset: caseInfo.cache === 'warm',
    throttlingMethod: 'devtools',
    throttling: {
      ...profile.lighthouseNetwork,
      cpuSlowdownMultiplier: caseInfo.cpuSlowdown,
    },
    formFactor: viewport.isMobile ? 'mobile' : 'desktop',
    screenEmulation: {
      mobile: Boolean(viewport.isMobile),
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: viewport.deviceScaleFactor,
      disabled: false,
    },
  }
}

function auditNumeric(lhr, id) {
  const audit = lhr.audits[id]
  const value = audit?.numericValue ?? audit?.score
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function auditDisplay(lhr, id) {
  return lhr.audits[id]?.displayValue ?? null
}

async function runLighthouseCase(chrome, baseUrl, caseInfo, reportPath) {
  const url = urlForCase(baseUrl, caseInfo.route, caseInfo.settings)
  const flags = lighthouseFlags(caseInfo, chrome.port)

  if (caseInfo.cache === 'warm') {
    await lighthouse(url, {
      ...flags,
      disableStorageReset: true,
      onlyAudits: ['network-requests'],
    })
  }

  const result = await lighthouse(url, flags)
  if (!result?.lhr) throw new Error(`Lighthouse returned no result for ${url}`)

  const lhr = result.lhr
  if (reportPath) {
    await mkdir(dirname(reportPath), { recursive: true })
    await writeFile(reportPath, JSON.stringify(lhr, null, 2))
  }

  return {
    ...caseInfo,
    url,
    requestedUrl: lhr.requestedUrl,
    finalDisplayedUrl: lhr.finalDisplayedUrl,
    lighthouseVersion: lhr.lighthouseVersion,
    fetchTime: lhr.fetchTime,
    userAgent: lhr.userAgent,
    performanceScore:
      typeof lhr.categories.performance?.score === 'number'
        ? lhr.categories.performance.score * 100
        : null,
    tbtMs: auditNumeric(lhr, 'total-blocking-time'),
    tbtDisplay: auditDisplay(lhr, 'total-blocking-time'),
    fcpMs: auditNumeric(lhr, 'first-contentful-paint'),
    lcpMs: auditNumeric(lhr, 'largest-contentful-paint'),
    cls: auditNumeric(lhr, 'cumulative-layout-shift'),
    speedIndexMs: auditNumeric(lhr, 'speed-index'),
    interactiveMs: auditNumeric(lhr, 'interactive'),
    totalByteWeightBytes: auditNumeric(lhr, 'total-byte-weight'),
    bootupTimeMs: auditNumeric(lhr, 'bootup-time'),
    mainThreadWorkMs: auditNumeric(lhr, 'mainthread-work-breakdown'),
    maxPotentialFidMs: auditNumeric(lhr, 'max-potential-fid'),
    reportPath: reportPath ? relative(rootDir, reportPath) : null,
  }
}

function createFailedSample(caseInfo, baseUrl, error, attempt, reportPath) {
  return {
    ...caseInfo,
    url: urlForCase(baseUrl, caseInfo.route, caseInfo.settings),
    requestedUrl: null,
    finalDisplayedUrl: null,
    lighthouseVersion: null,
    fetchTime: null,
    userAgent: null,
    performanceScore: null,
    tbtMs: null,
    tbtDisplay: null,
    fcpMs: null,
    lcpMs: null,
    cls: null,
    speedIndexMs: null,
    interactiveMs: null,
    totalByteWeightBytes: null,
    bootupTimeMs: null,
    mainThreadWorkMs: null,
    maxPotentialFidMs: null,
    reportPath: reportPath ? relative(rootDir, reportPath) : null,
    lighthouseComplete: false,
    missingMetrics: [...requiredLighthouseMetrics],
    attempt,
    error: error instanceof Error ? error.message : String(error),
  }
}

async function runLighthouseCaseWithRetries(
  chrome,
  baseUrl,
  caseInfo,
  reportPath,
  retries,
) {
  let currentChrome = chrome
  const maxAttempts = retries + 1

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const sample = await runLighthouseCase(
        currentChrome,
        baseUrl,
        caseInfo,
        reportPath,
      )
      const missingMetrics = missingLighthouseMetrics(sample)
      const annotatedSample = {
        ...sample,
        lighthouseComplete: missingMetrics.length === 0,
        missingMetrics,
        attempt,
      }

      if (isCompleteLighthouseSample(annotatedSample) || attempt === maxAttempts) {
        return { chrome: currentChrome, sample: annotatedSample }
      }

      process.stdout.write(
        `  retrying incomplete Lighthouse row; missing=${missingMetrics.join(
          ',',
        )} attempt=${attempt}/${maxAttempts}\n`,
      )
    } catch (error) {
      if (attempt === maxAttempts) {
        return {
          chrome: currentChrome,
          sample: createFailedSample(
            caseInfo,
            baseUrl,
            error,
            attempt,
            reportPath,
          ),
        }
      }

      process.stdout.write(
        `  retrying Lighthouse error; ${
          error instanceof Error ? error.message : String(error)
        } attempt=${attempt}/${maxAttempts}\n`,
      )
    }

    await currentChrome.stop()
    currentChrome = await startChrome()
  }

  throw new Error('Unreachable Lighthouse retry state')
}

function metricValue(sample, key) {
  const value = sample[key]
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

function stddev(values) {
  if (values.length < 2) return 0
  const avg = mean(values)
  const variance =
    values.reduce((total, value) => total + (value - avg) ** 2, 0) /
    (values.length - 1)
  return Math.sqrt(variance)
}

function summarizeGroup(samples) {
  const metrics = [
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

  const summary = {}
  for (const metric of metrics) {
    const values = samples
      .map((sample) => metricValue(sample, metric))
      .filter((value) => value !== null)
    const avg = mean(values)
    const sd = stddev(values)
    const sem =
      values.length > 1 && sd !== null ? sd / Math.sqrt(values.length) : 0
    summary[metric] = {
      n: values.length,
      mean: avg,
      median: quantile(values, 0.5),
      p75: quantile(values, 0.75),
      p95: quantile(values, 0.95),
      min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null,
      stddev: sd,
      ci95Low: avg === null ? null : avg - 1.96 * sem,
      ci95High: avg === null ? null : avg + 1.96 * sem,
    }
  }
  return summary
}

function groupKey(sample) {
  return [
    `points=${sample.settings.points}`,
    `cpuSlowdown=${sample.cpuSlowdown}`,
    `network=${sample.network}`,
    `cache=${sample.cache}`,
    `route=${sample.route}`,
  ].join('|')
}

function formatNumber(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return ''
  return value.toFixed(digits)
}

function formatBytes(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return ''
  return `${Math.round(value)}`
}

function createMarkdownSummary(samples) {
  const groups = new Map()
  for (const sample of samples) {
    const key = groupKey(sample)
    const group = groups.get(key) ?? []
    group.push(sample)
    groups.set(key, group)
  }

  const rows = [...groups.entries()].map(([key, group]) => ({
    key,
    first: group[0],
    summary: summarizeGroup(group),
  }))

  rows.sort((a, b) => a.key.localeCompare(b.key))

  const lines = [
    '# Deferred Hydration Lighthouse Summary',
    '',
    `Generated at: ${new Date().toISOString()}`,
    '',
    'TBT is Lighthouse total-blocking-time for page load. It is reported separately from Playwright trigger latency and scripted INP.',
    '',
    '| Points | CPU slowdown | Network | Cache | Route | Runs | Perf score | TBT | FCP | LCP | CLS | TTI | Total bytes |',
    '| ---: | ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ]

  for (const row of rows) {
    const summary = row.summary
    lines.push(
      [
        row.first.settings.points,
        row.first.cpuSlowdown,
        row.first.network,
        row.first.cache,
        row.first.route,
        summary.tbtMs.n,
        formatNumber(summary.performanceScore.mean),
        formatNumber(summary.tbtMs.mean),
        formatNumber(summary.fcpMs.mean),
        formatNumber(summary.lcpMs.mean),
        formatNumber(summary.cls.mean, 3),
        formatNumber(summary.interactiveMs.mean),
        formatBytes(summary.totalByteWeightBytes.mean),
      ]
        .join(' | ')
        .replace(/^/, '| ') + ' |',
    )
  }

  return `${lines.join('\n')}\n`
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
  'route',
  'cpuSlowdown',
  'network',
  'cache',
  'run',
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
  'reportPath',
  'lighthouseComplete',
  'missingMetrics',
  'attempt',
  'error',
]

function csvRow(sample) {
  return csvColumns
    .map((column) => {
      if (column === 'points') return sample.settings.points
      return toCsvValue(sample[column])
    })
    .join(',')
}

function createCsv(samples) {
  const lines = [csvColumns.join(',')]
  for (const sample of samples) lines.push(csvRow(sample))
  return `${lines.join('\n')}\n`
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2))
  const samples = []
  const partialJsonPath = resolve(args.outDir, 'samples.partial.ndjson')
  const partialCsvPath = resolve(args.outDir, 'samples.partial.csv')
  const caseSpecs = args.caseList
    ? await loadCaseList(args.caseList)
    : createMatrixCases(args)

  await mkdir(args.outDir, { recursive: true })
  await rm(resolve(args.outDir, 'reports'), { recursive: true, force: true })
  await writeFile(partialJsonPath, '')
  await writeFile(partialCsvPath, `${csvColumns.join(',')}\n`)

  if (!args.skipBuild) {
    await runCommand('pnpm', ['run', 'build:app'])
  }

  const server = await startPreviewServer()

  try {
    for (const caseSpec of caseSpecs) {
      const { points, cpuSlowdown, network, cache, route, settings } = caseSpec
      let chrome = await startChrome()
      try {
        for (let run = 1; run <= args.runs; run++) {
          const caseInfo = {
            points,
            route,
            cpuSlowdown,
            network,
            cache,
            run,
            settings,
          }
          const reportPath =
            args.reportSamples && run === 1
              ? resolve(
                  args.outDir,
                  'reports',
                  `points-${points}_cpuSlowdown-${cpuSlowdown}_${network}_${cache}_${route}.json`,
                )
              : null

          process.stdout.write(
            `lighthouse points=${points} cpuSlowdown=${cpuSlowdown} network=${network} cache=${cache} route=${route} run=${run}/${args.runs}\n`,
          )

          const result = await runLighthouseCaseWithRetries(
            chrome,
            server.baseUrl,
            caseInfo,
            reportPath,
            args.retries,
          )
          chrome = result.chrome
          samples.push(result.sample)
          await appendFile(partialJsonPath, `${JSON.stringify(result.sample)}\n`)
          await appendFile(partialCsvPath, `${csvRow(result.sample)}\n`)
        }
      } finally {
        await chrome.stop()
      }
    }
  } finally {
    await server.stop()
  }

  await writeFile(
    resolve(args.outDir, 'samples.json'),
    JSON.stringify(samples, null, 2),
  )
  await writeFile(resolve(args.outDir, 'samples.csv'), createCsv(samples))
  await writeFile(
    resolve(args.outDir, 'summary.md'),
    createMarkdownSummary(samples),
  )

  console.log(
    `\nWrote ${samples.length} Lighthouse samples to ${relative(
      rootDir,
      args.outDir,
    )}`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
