#!/usr/bin/env node

import { chromium } from '@playwright/test'
import { brotliCompressSync, gzipSync } from 'node:zlib'
import { createWriteStream, existsSync } from 'node:fs'
import {
  appendFile,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import net from 'node:net'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const defaultOutDir = resolve(rootDir, 'bench-results')
const require = createRequire(import.meta.url)

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

function isSsrTableRoute(route) {
  return route.startsWith('ssr-')
}

function isFullRoute(route) {
  return route === 'full' || route === 'ssr-full'
}

function widgetRegionTestId(route) {
  return isSsrTableRoute(route) ? 'ssr-table-region' : 'chart-region'
}

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
    viewport: { width: 1280, height: 900 },
  },
  mobile: {
    label: 'Mobile network + viewport',
    viewport: { width: 390, height: 844, isMobile: true },
    network: {
      latency: 150,
      downloadThroughput: Math.floor((1.6 * 1024 * 1024) / 8),
      uploadThroughput: Math.floor((750 * 1024) / 8),
    },
  },
}

function parseCliArgs(argv) {
  const result = {
    runs: 100,
    points: undefined,
    cpuSlowdown: undefined,
    network: undefined,
    cache: undefined,
    routes: undefined,
    suite: 'primary',
    outDir: defaultOutDir,
    traceSamples: true,
    skipBuild: false,
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
    else if (key === 'trace' || key === 'trace-samples') {
      result.traceSamples = value !== 'false'
    } else if (key === 'skip-build') {
      result.skipBuild = value !== 'false'
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
        reject(new Error('Unable to allocate a benchmark port'))
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

async function applyEnvironment(page, caseInfo, cacheMode) {
  const profile = networkProfiles[caseInfo.network]
  const client = await page.context().newCDPSession(page)

  await client.send('Network.enable')
  await client.send('Network.setCacheDisabled', {
    cacheDisabled: cacheMode === 'cold',
  })
  await client.send('Emulation.setCPUThrottlingRate', {
    rate: caseInfo.cpuSlowdown,
  })

  if (profile.network) {
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      ...profile.network,
    })
  }

  return client
}

function describeTarget(element) {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) return ''
  const target = element.closest?.('[data-testid]') ?? element
  const testId = target.getAttribute?.('data-testid')
  if (testId) return `[data-testid="${testId}"]`
  const id = target.id ? `#${target.id}` : ''
  const className =
    typeof target.className === 'string'
      ? `.${target.className.trim().split(/\s+/).filter(Boolean).join('.')}`
      : ''
  return `${target.localName}${id}${className}`.slice(0, 120)
}

function metricInitScript(webVitalsSource) {
  return `${webVitalsSource}
(() => {
  const metrics = {
    paints: {},
    lcp: 0,
    cls: 0,
    webVitals: {
      inp: null,
      inpReports: [],
    },
    interactionMarks: {},
    interactions: [],
    interactionGroups: {},
  }

  const describeTarget = ${describeTarget.toString()}

  function observe(type, callback, options = {}) {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) callback(entry)
      })
      observer.observe({ type, buffered: true, ...options })
      return observer
    } catch {}
  }

  function compactInpMetric(metric) {
    const attribution = metric.attribution ?? {}
    return {
      name: metric.name,
      value: metric.value,
      delta: metric.delta,
      id: metric.id,
      rating: metric.rating,
      entries: (metric.entries ?? []).map((entry) => ({
        name: entry.name,
        startTime: entry.startTime,
        duration: entry.duration,
        interactionId: entry.interactionId,
        target: describeTarget(entry.target),
      })),
      attribution: {
        interactionTarget: attribution.interactionTarget,
        interactionType: attribution.interactionType,
        interactionTime: attribution.interactionTime,
        nextPaintTime: attribution.nextPaintTime,
        inputDelay: attribution.inputDelay,
        processingDuration: attribution.processingDuration,
        presentationDelay: attribution.presentationDelay,
        loadState: attribution.loadState,
      },
    }
  }

  observe('paint', (entry) => {
    metrics.paints[entry.name] = entry.startTime
  })
  observe('largest-contentful-paint', (entry) => {
    metrics.lcp = entry.startTime
  })
  observe('layout-shift', (entry) => {
    if (!entry.hadRecentInput) metrics.cls += entry.value
  })
  observe('event', (entry) => {
    if (!entry.interactionId) return
    const target = describeTarget(entry.target)
    const interaction = {
      name: entry.name,
      startTime: entry.startTime,
      duration: entry.duration,
      processingStart: entry.processingStart,
      processingEnd: entry.processingEnd,
      interactionId: entry.interactionId,
      target,
    }
    metrics.interactions.push(interaction)
    const key = String(entry.interactionId)
    const group =
      metrics.interactionGroups[key] ??
      {
        interactionId: entry.interactionId,
        startTime: entry.startTime,
        duration: 0,
        target,
        entries: [],
      }
    group.startTime = Math.min(group.startTime, entry.startTime)
    group.duration = Math.max(group.duration, entry.duration)
    group.target ||= target
    group.entries.push(interaction)
    metrics.interactionGroups[key] = group
  }, { durationThreshold: 16 })
  const webVitalsApi =
    window.webVitals ??
    globalThis.webVitals ??
    (typeof webVitals !== 'undefined' ? webVitals : null)

  if (webVitalsApi?.onINP) {
    webVitalsApi.onINP((metric) => {
      const compact = compactInpMetric(metric)
      metrics.webVitals.inp = compact
      metrics.webVitals.inpReports.push(compact)
    }, {
      reportAllChanges: true,
      durationThreshold: 16,
      includeProcessedEventEntries: true,
      generateTarget: describeTarget,
    })
  }

  window.__dhMarkInteraction = (label) => {
    metrics.interactionMarks[label] = performance.now()
    return metrics.interactionMarks[label]
  }

  window.__dhReadInteraction = (label, targetTestId) => {
    const mark = metrics.interactionMarks[label] ?? 0
    const targetNeedle = targetTestId
      ? '[data-testid="' + targetTestId + '"]'
      : ''
    const groups = Object.values(metrics.interactionGroups)
      .filter((group) => group.startTime >= mark - 8)
      .filter((group) => !targetNeedle || group.target === targetNeedle || group.entries.some((entry) => entry.target === targetNeedle))
      .sort((a, b) => a.startTime - b.startTime)
    const group = groups[0] ?? null
    const vitalsReport = metrics.webVitals.inpReports
      .filter((report) => (report.attribution?.interactionTime ?? 0) >= mark - 8)
      .filter((report) => !targetNeedle || report.attribution?.interactionTarget === targetNeedle || report.entries.some((entry) => entry.target === targetNeedle))
      .at(-1)

    if (!group && !vitalsReport) return null

    return {
      label,
      target: group?.target ?? vitalsReport?.attribution?.interactionTarget ?? '',
      startTime: group?.startTime ?? vitalsReport?.attribution?.interactionTime ?? null,
      duration: group?.duration ?? vitalsReport?.value ?? null,
      eventTiming: group,
      webVitals: vitalsReport ?? null,
    }
  }

  window.__dhReadMetrics = () => {
    const navigation = performance.getEntriesByType('navigation')[0]
    return {
      ...metrics,
      navigation: navigation ? navigation.toJSON() : null,
      now: performance.now(),
      resources: performance.getEntriesByType('resource').map((entry) => ({
        name: entry.name,
        initiatorType: entry.initiatorType,
        startTime: entry.startTime,
        duration: entry.duration,
        transferSize: entry.transferSize,
        encodedBodySize: entry.encodedBodySize,
        decodedBodySize: entry.decodedBodySize,
      })),
    }
  }
})()
`
}

async function readMetrics(page) {
  return page.evaluate(() => {
    return window.__dhReadMetrics?.()
  })
}

async function readInteraction(page, label, targetTestId) {
  return page.evaluate(
    ({ label: readLabel, targetTestId: readTargetTestId }) => {
      return window.__dhReadInteraction?.(readLabel, readTargetTestId)
    },
    { label, targetTestId },
  )
}

async function readAssetSizes() {
  const clientDir = resolve(rootDir, 'dist/client')
  const sizes = new Map()

  async function visit(dir) {
    if (!existsSync(dir)) return

    for (const entry of await readdir(dir)) {
      const fullPath = join(dir, entry)
      const info = await stat(fullPath)
      if (info.isDirectory()) {
        await visit(fullPath)
        continue
      }
      if (!entry.endsWith('.js')) continue

      const content = await readFile(fullPath)
      const relativePath = relative(clientDir, fullPath).replaceAll('\\', '/')
      const size = {
        file: relativePath,
        raw: content.byteLength,
        gzip: gzipSync(content).byteLength,
        brotli: brotliCompressSync(content).byteLength,
      }
      sizes.set(`/${relativePath}`, size)
      sizes.set(relativePath, size)
      sizes.set(entry, size)
    }
  }

  await visit(clientDir)
  return sizes
}

function jsResourcesFromMetrics(metrics, assetSizes) {
  const seen = new Map()

  for (const resource of metrics?.resources ?? []) {
    const url = new URL(resource.name)
    if (!url.pathname.endsWith('.js')) continue

    const key = decodeURIComponent(url.pathname)
    const basename = key.slice(key.lastIndexOf('/') + 1)
    const asset =
      assetSizes.get(key) ??
      assetSizes.get(key.slice(1)) ??
      assetSizes.get(basename)

    seen.set(key, {
      name: key,
      initiatorType: resource.initiatorType,
      transferSize: resource.transferSize,
      encodedBodySize: resource.encodedBodySize,
      raw: asset?.raw ?? resource.decodedBodySize ?? 0,
      gzip: asset?.gzip ?? resource.encodedBodySize ?? 0,
      brotli: asset?.brotli ?? 0,
    })
  }

  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
}

function sumBy(resources, key) {
  return resources.reduce((total, resource) => total + (resource[key] ?? 0), 0)
}

function resourceDelta(afterResources, beforeResources, key) {
  return Math.max(0, sumBy(afterResources, key) - sumBy(beforeResources, key))
}

async function waitForStartup(page, route) {
  await page
    .locator('[data-testid="startup-marker"][data-hydrated="true"]')
    .waitFor({
      timeout: 30_000,
    })

  if (route === 'full') {
    await waitForChartHydrated(page)
  } else if (route === 'ssr-full') {
    await waitForTableHydrated(page)
  } else {
    await page.waitForTimeout(50)
  }

  return page.evaluate(() => performance.now())
}

async function scrollToWidget(page, route) {
  return page.getByTestId(widgetRegionTestId(route)).evaluate((element) => {
    const before = performance.now()
    element.scrollIntoView({ block: 'center', inline: 'nearest' })
    return before
  })
}

async function waitForChartHydrated(page) {
  await page
    .locator('[data-testid="chart-region"][data-hydrated="true"]')
    .waitFor({
      timeout: 30_000,
    })
  await page.getByTestId('chart-action').waitFor({ timeout: 30_000 })
  return page.evaluate(() => performance.now())
}

async function waitForTableHydrated(page) {
  await page
    .locator('[data-testid="ssr-table-region"][data-hydrated="true"]')
    .waitFor({
      timeout: 30_000,
    })
  await page.getByTestId('table-density-action').waitFor({ timeout: 30_000 })
  return page.evaluate(() => performance.now())
}

async function waitForWidgetHydrated(page, route) {
  return isSsrTableRoute(route)
    ? waitForTableHydrated(page)
    : waitForChartHydrated(page)
}

async function waitForText(page, testId, text, timeout = 30_000) {
  await page.waitForFunction(
    ({ expectedTestId, expectedText }) => {
      return (
        document.querySelector(`[data-testid="${expectedTestId}"]`)
          ?.textContent === expectedText
      )
    },
    { expectedTestId: testId, expectedText: text },
    { timeout },
  )
}

async function scrollToAction(page, testId) {
  await page.getByTestId(testId).evaluate((element) => {
    element.scrollIntoView({ block: 'center', inline: 'center' })
  })
  await page.waitForTimeout(50)
}

async function performMeasuredActivation(
  page,
  label,
  actionTestId,
  countTestId,
  expectedText,
) {
  const action = page.getByTestId(actionTestId)
  const attempts = [
    () => action.click({ timeout: 5_000 }),
    () => action.click({ force: true, timeout: 5_000 }),
    async () => {
      await action.focus()
      await page.keyboard.press('Enter')
    },
  ]
  let lastError

  for (const attempt of attempts) {
    try {
      await scrollToAction(page, actionTestId)
      await page.evaluate(
        (interactionLabel) => window.__dhMarkInteraction?.(interactionLabel),
        label,
      )
      await attempt()
      await waitForText(page, countTestId, expectedText, 2_500)
      await page.waitForTimeout(150)
      return readInteraction(page, label, actionTestId)
    } catch (error) {
      lastError = error
    }
  }

  throw lastError
}

async function measureShellInteraction(page) {
  return performMeasuredActivation(
    page,
    'shell',
    'shell-action',
    'shell-click-count',
    '1',
  )
}

async function measureChartInteraction(page) {
  return performMeasuredActivation(
    page,
    'chart',
    'chart-action',
    'chart-click-count',
    '1',
  )
}

async function measureTableInteraction(page) {
  return performMeasuredActivation(
    page,
    'widget',
    'table-density-action',
    'table-density-count',
    '1',
  )
}

async function measureWidgetInteraction(page, route) {
  return isSsrTableRoute(route)
    ? measureTableInteraction(page)
    : measureChartInteraction(page)
}

async function triggerBoundary(page, route) {
  if (isFullRoute(route)) {
    await scrollToWidget(page, route)
    return {
      trigger: 'startup',
      triggerAt: null,
      hydratedAt: null,
      interactive: true,
    }
  }

  if (route === 'ssr-defer-interaction') {
    await scrollToWidget(page, route)
    const triggerAt = await page.evaluate(() => performance.now())
    await page.getByTestId(widgetRegionTestId(route)).click({
      position: { x: 8, y: 8 },
    })
    const hydratedAt = await waitForWidgetHydrated(page, route)
    return {
      trigger: 'click',
      triggerAt,
      hydratedAt,
      interactive: true,
    }
  }

  const triggerAt = await scrollToWidget(page, route)
  const hydratedAt = await waitForWidgetHydrated(page, route)
  return {
    trigger: 'scroll',
    triggerAt,
    hydratedAt,
    interactive: true,
  }
}

async function warmCache(context, baseUrl, route, settings, caseInfo) {
  const page = await context.newPage()
  await applyEnvironment(page, caseInfo, 'warm')
  await page.goto(urlForCase(baseUrl, route, settings), {
    waitUntil: 'domcontentloaded',
  })
  await waitForStartup(page, route)
  await triggerBoundary(page, route)
  await page.close()
}

function urlForCase(baseUrl, route, settings) {
  const url = new URL(`/${route}`, baseUrl)
  url.searchParams.set('points', String(settings.points))
  return url.href
}

async function startChromeTrace(client, tracePath) {
  await mkdir(dirname(tracePath), { recursive: true })
  await client.send('Tracing.start', {
    categories:
      'devtools.timeline,blink.user_timing,loading,v8,disabled-by-default-devtools.timeline',
    transferMode: 'ReturnAsStream',
  })

  return async () => {
    const complete = new Promise((resolvePromise) => {
      client.on('Tracing.tracingComplete', resolvePromise)
    })
    await client.send('Tracing.end')
    const event = await complete
    const stream = event.stream
    const output = createWriteStream(tracePath)

    while (stream) {
      const chunk = await client.send('IO.read', { handle: stream })
      output.write(chunk.data)
      if (chunk.eof) break
    }

    output.end()
    await client.send('IO.close', { handle: stream })
  }
}

async function measureRun(
  browser,
  caseInfo,
  baseUrl,
  assetSizes,
  webVitalsSource,
  tracePath,
) {
  const profile = networkProfiles[caseInfo.network]
  const context = await browser.newContext({
    viewport: {
      width: profile.viewport.width,
      height: profile.viewport.height,
    },
    isMobile: Boolean(profile.viewport.isMobile),
  })
  await context.addInitScript(metricInitScript(webVitalsSource))

  try {
    if (caseInfo.cache === 'warm') {
      await warmCache(
        context,
        baseUrl,
        caseInfo.route,
        caseInfo.settings,
        caseInfo,
      )
    }

    const page = await context.newPage()
    const client = await applyEnvironment(page, caseInfo, caseInfo.cache)
    const stopTrace = tracePath
      ? await startChromeTrace(client, tracePath)
      : undefined

    let failed = false
    let failureMessage = null

    try {
      await page.goto(urlForCase(baseUrl, caseInfo.route, caseInfo.settings), {
        waitUntil: 'domcontentloaded',
      })

      const startupReadyAt = await waitForStartup(page, caseInfo.route)
      const startupMetrics = await readMetrics(page)
      const startupResources = jsResourcesFromMetrics(
        startupMetrics,
        assetSizes,
      )
      const shellInteraction = await measureShellInteraction(page)
      await page.waitForTimeout(250)

      const beforeTriggerMetrics = await readMetrics(page)
      const beforeTriggerResources = jsResourcesFromMetrics(
        beforeTriggerMetrics,
        assetSizes,
      )

      const triggerResult = await triggerBoundary(page, caseInfo.route)
      const widgetInteraction = await measureWidgetInteraction(
        page,
        caseInfo.route,
      )
      await page.waitForTimeout(150)

      const finalMetrics = await readMetrics(page)
      const finalResources = jsResourcesFromMetrics(finalMetrics, assetSizes)
      const deferredRawBytes = resourceDelta(
        finalResources,
        beforeTriggerResources,
        'raw',
      )
      const triggerLatencyMs =
        triggerResult.hydratedAt === null || triggerResult.triggerAt === null
          ? null
          : triggerResult.hydratedAt - triggerResult.triggerAt
      const pageInp = finalMetrics?.webVitals?.inp ?? null

      return {
        ...caseInfo,
        url: page.url(),
        startupReadyAt,
        fcpMs: finalMetrics?.paints?.['first-contentful-paint'] ?? null,
        lcpMs: finalMetrics?.lcp ?? null,
        cls: finalMetrics?.cls ?? null,
        pageInpMs: pageInp?.value ?? null,
        pageInpTarget: pageInp?.attribution?.interactionTarget ?? null,
        shellInpMs: shellInteraction?.duration ?? null,
        shellInp: shellInteraction,
        widgetInpMs: widgetInteraction?.duration ?? null,
        widgetInp: widgetInteraction,
        chartInpMs: widgetInteraction?.duration ?? null,
        chartInp: widgetInteraction,
        ttfbMs: finalMetrics?.navigation
          ? finalMetrics.navigation.responseStart -
            finalMetrics.navigation.requestStart
          : null,
        documentTransferBytes: finalMetrics?.navigation?.transferSize ?? null,
        documentEncodedBodyBytes:
          finalMetrics?.navigation?.encodedBodySize ?? null,
        documentDecodedBodyBytes:
          finalMetrics?.navigation?.decodedBodySize ?? null,
        initialJsResourceCount: startupResources.length,
        initialJsRawBytes: sumBy(startupResources, 'raw'),
        initialJsGzipBytes: sumBy(startupResources, 'gzip'),
        initialJsBrotliBytes: sumBy(startupResources, 'brotli'),
        initialJsEncodedBodyBytes: sumBy(startupResources, 'encodedBodySize'),
        initialJsTransferBytes: sumBy(startupResources, 'transferSize'),
        preTriggerJsResourceCount: beforeTriggerResources.length,
        preTriggerJsRawBytes: resourceDelta(
          beforeTriggerResources,
          startupResources,
          'raw',
        ),
        preTriggerJsGzipBytes: resourceDelta(
          beforeTriggerResources,
          startupResources,
          'gzip',
        ),
        preTriggerJsBrotliBytes: resourceDelta(
          beforeTriggerResources,
          startupResources,
          'brotli',
        ),
        preTriggerJsEncodedBodyBytes: resourceDelta(
          beforeTriggerResources,
          startupResources,
          'encodedBodySize',
        ),
        preTriggerJsTransferBytes: resourceDelta(
          beforeTriggerResources,
          startupResources,
          'transferSize',
        ),
        prefetchBeforeTrigger:
          caseInfo.route.endsWith('defer-visible-prefetch') &&
          deferredRawBytes === 0,
        finalJsResourceCount: finalResources.length,
        finalJsRawBytes: sumBy(finalResources, 'raw'),
        finalJsGzipBytes: sumBy(finalResources, 'gzip'),
        finalJsBrotliBytes: sumBy(finalResources, 'brotli'),
        finalJsEncodedBodyBytes: sumBy(finalResources, 'encodedBodySize'),
        finalJsTransferBytes: sumBy(finalResources, 'transferSize'),
        deferredJsGzipBytes: resourceDelta(
          finalResources,
          beforeTriggerResources,
          'gzip',
        ),
        deferredJsBrotliBytes: resourceDelta(
          finalResources,
          beforeTriggerResources,
          'brotli',
        ),
        deferredJsEncodedBodyBytes: resourceDelta(
          finalResources,
          beforeTriggerResources,
          'encodedBodySize',
        ),
        deferredJsTransferBytes: resourceDelta(
          finalResources,
          beforeTriggerResources,
          'transferSize',
        ),
        trigger: triggerResult.trigger,
        triggerLatencyMs,
        interactive: triggerResult.interactive,
        tracePath: tracePath ? relative(rootDir, tracePath) : null,
        failed,
        failureMessage,
      }
    } catch (error) {
      failed = true
      failureMessage = error instanceof Error ? error.message : String(error)
      throw error
    } finally {
      await stopTrace?.()
      await page.close().catch(() => {})
    }
  } finally {
    await context.close()
  }
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
    const sample = []
    for (let index = 0; index < values.length; index++) {
      sample.push(values[Math.floor(random() * values.length)])
    }
    medians.push(quantile(sample, 0.5))
  }

  return [quantile(medians, 0.025), quantile(medians, 0.975)]
}

function summarizeGroup(samples) {
  const metrics = [
    'initialJsGzipBytes',
    'initialJsBrotliBytes',
    'initialJsEncodedBodyBytes',
    'initialJsTransferBytes',
    'preTriggerJsGzipBytes',
    'preTriggerJsBrotliBytes',
    'preTriggerJsEncodedBodyBytes',
    'preTriggerJsTransferBytes',
    'deferredJsGzipBytes',
    'deferredJsBrotliBytes',
    'deferredJsEncodedBodyBytes',
    'deferredJsTransferBytes',
    'triggerLatencyMs',
    'shellInpMs',
    'widgetInpMs',
    'chartInpMs',
    'pageInpMs',
    'lcpMs',
    'cls',
    'ttfbMs',
    'documentTransferBytes',
    'documentEncodedBodyBytes',
    'documentDecodedBodyBytes',
  ]

  const summary = {}
  for (const metric of metrics) {
    const values = samples
      .map((sample) => metricValue(sample, metric))
      .filter((value) => value !== null)
    const [ciLow, ciHigh] = medianCi(values)
    summary[metric] = {
      median: quantile(values, 0.5),
      p75: quantile(values, 0.75),
      ciLow,
      ciHigh,
      n: values.length,
    }
  }
  summary.prefetchBeforeTriggerCount = samples.filter(
    (sample) => sample.prefetchBeforeTrigger,
  ).length
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

  const rows = [...groups.entries()].map(([key, group]) => {
    const first = group[0]
    return {
      key,
      first,
      summary: summarizeGroup(group),
    }
  })

  rows.sort((a, b) => a.key.localeCompare(b.key))

  const lines = [
    '# Deferred Hydration Benchmark Summary',
    '',
    `Generated at: ${new Date().toISOString()}`,
    '',
    'Byte columns report local gzip and brotli estimates from built assets plus Chrome Resource Timing bytes. Encoded body and transfer bytes are the observed browser-side values for the server and cache mode used in the run.',
    '',
    '| Points | CPU slowdown | Network | Cache | Route | Runs | Initial JS gzip | Initial JS brotli | Initial JS transfer | Pre-trigger JS transfer | Deferred JS transfer | Trigger latency | Shell INP | Widget INP | Page INP | LCP | Prefetch before trigger |',
    '| ---: | ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
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
        summary.initialJsGzipBytes.n,
        formatBytes(summary.initialJsGzipBytes.median),
        formatBytes(summary.initialJsBrotliBytes.median),
        formatBytes(summary.initialJsTransferBytes.median),
        formatBytes(summary.preTriggerJsTransferBytes.median),
        formatBytes(summary.deferredJsTransferBytes.median),
        formatNumber(summary.triggerLatencyMs.median),
        formatNumber(summary.shellInpMs.median),
        formatNumber(summary.widgetInpMs.median),
        formatNumber(summary.pageInpMs.median),
        formatNumber(summary.lcpMs.median),
        summary.prefetchBeforeTriggerCount,
      ]
        .join(' | ')
        .replace(/^/, '| ') + ' |',
    )
  }

  lines.push('')
  lines.push('## Confidence Intervals')
  lines.push('')
  lines.push(
    'Intervals are bootstrap 95% confidence intervals for medians when at least four samples exist; smaller groups show p25-p75.',
  )
  lines.push('')
  lines.push('| Case | Metric | Median | p75 | CI low | CI high |')
  lines.push('| --- | --- | ---: | ---: | ---: | ---: |')

  for (const row of rows) {
    for (const metric of [
      'initialJsGzipBytes',
      'initialJsBrotliBytes',
      'initialJsEncodedBodyBytes',
      'initialJsTransferBytes',
      'preTriggerJsGzipBytes',
      'preTriggerJsBrotliBytes',
      'preTriggerJsEncodedBodyBytes',
      'preTriggerJsTransferBytes',
      'deferredJsGzipBytes',
      'deferredJsBrotliBytes',
      'deferredJsEncodedBodyBytes',
      'deferredJsTransferBytes',
      'triggerLatencyMs',
      'shellInpMs',
      'widgetInpMs',
      'chartInpMs',
      'pageInpMs',
      'lcpMs',
      'ttfbMs',
      'documentTransferBytes',
      'documentEncodedBodyBytes',
      'documentDecodedBodyBytes',
    ]) {
      const value = row.summary[metric]
      lines.push(
        `| ${row.key} | ${metric} | ${formatNumber(value.median)} | ${formatNumber(value.p75)} | ${formatNumber(value.ciLow)} | ${formatNumber(value.ciHigh)} |`,
      )
    }
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
  'triggerLatencyMs',
  'shellInpMs',
  'widgetInpMs',
  'chartInpMs',
  'pageInpMs',
  'pageInpTarget',
  'initialJsResourceCount',
  'preTriggerJsResourceCount',
  'finalJsResourceCount',
  'initialJsRawBytes',
  'initialJsGzipBytes',
  'initialJsBrotliBytes',
  'initialJsEncodedBodyBytes',
  'initialJsTransferBytes',
  'preTriggerJsRawBytes',
  'preTriggerJsGzipBytes',
  'preTriggerJsBrotliBytes',
  'preTriggerJsEncodedBodyBytes',
  'preTriggerJsTransferBytes',
  'prefetchBeforeTrigger',
  'finalJsRawBytes',
  'finalJsGzipBytes',
  'finalJsBrotliBytes',
  'finalJsEncodedBodyBytes',
  'finalJsTransferBytes',
  'deferredJsGzipBytes',
  'deferredJsBrotliBytes',
  'deferredJsEncodedBodyBytes',
  'deferredJsTransferBytes',
  'fcpMs',
  'lcpMs',
  'cls',
  'ttfbMs',
  'documentTransferBytes',
  'documentEncodedBodyBytes',
  'documentDecodedBodyBytes',
  'interactive',
  'tracePath',
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

async function readWebVitalsSource() {
  const attributionEntry = require.resolve('web-vitals/attribution', {
    paths: [rootDir],
  })
  const sourcePath = attributionEntry.replace(
    /web-vitals\.attribution\.(?:umd\.cjs|js)$/,
    'web-vitals.attribution.iife.js',
  )
  return readFile(sourcePath, 'utf8')
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2))
  const samples = []
  const partialJsonPath = resolve(args.outDir, 'samples.partial.ndjson')
  const partialCsvPath = resolve(args.outDir, 'samples.partial.csv')

  await mkdir(args.outDir, { recursive: true })
  await rm(resolve(args.outDir, 'traces'), { recursive: true, force: true })
  await writeFile(partialJsonPath, '')
  await writeFile(partialCsvPath, `${csvColumns.join(',')}\n`)

  if (!args.skipBuild) {
    await runCommand('pnpm', ['run', 'build:app'])
  }

  const assetSizes = await readAssetSizes()
  const webVitalsSource = await readWebVitalsSource()
  const browser = await chromium.launch({ headless: true })
  const server = await startPreviewServer()

  try {
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

              for (let run = 1; run <= args.runs; run++) {
                const settings = { points }
                const caseInfo = {
                  points,
                  route,
                  cpuSlowdown,
                  network,
                  cache,
                  run,
                  settings,
                }
                const tracePath =
                  args.traceSamples && run === 1
                    ? resolve(
                        args.outDir,
                        'traces',
                        `points-${points}_cpuSlowdown-${cpuSlowdown}_${network}_${cache}_${route}.json`,
                      )
                    : null

                process.stdout.write(
                  `points=${points} cpuSlowdown=${cpuSlowdown} network=${network} cache=${cache} route=${route} run=${run}/${args.runs}\n`,
                )

                const sample = await measureRun(
                  browser,
                  caseInfo,
                  server.baseUrl,
                  assetSizes,
                  webVitalsSource,
                  tracePath,
                )
                samples.push(sample)
                await appendFile(partialJsonPath, `${JSON.stringify(sample)}\n`)
                await appendFile(partialCsvPath, `${csvRow(sample)}\n`)
              }
            }
          }
        }
      }
    }
  } finally {
    await server.stop()
    await browser.close()
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
    `\nWrote ${samples.length} samples to ${relative(rootDir, args.outDir)}`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
