import fs from 'node:fs/promises'
import path from 'node:path'
import http from 'node:http'
import zlib from 'node:zlib'
import { createHash } from 'node:crypto'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'

const { values } = parseArgs({
  options: {
    'artifact-root': { type: 'string' },
    'bundle-root': { type: 'string' },
    provenance: { type: 'string' },
    'browser-path': { type: 'string' },
    'playwright-module': { type: 'string' },
    port: { type: 'string', default: '4188' },
    'reuse-gates': { type: 'boolean', default: false },
    'gates-only': { type: 'boolean', default: false },
  },
})
if (!values['artifact-root'] || !values['bundle-root']) {
  throw new Error(
    'Required: --artifact-root <directory> --bundle-root <directory>',
  )
}
const out = path.resolve(values['artifact-root'])
const bundleRoot = path.resolve(values['bundle-root'])
const provenancePath = path.resolve(
  values.provenance ?? path.join(out, 'provenance.json'),
)
const port = Number(values.port)
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('Invalid --port')
}
const moduleOption = values['playwright-module']
const moduleSpecifier =
  moduleOption &&
  (path.isAbsolute(moduleOption) || moduleOption.startsWith('.'))
    ? pathToFileURL(path.resolve(moduleOption)).href
    : (moduleOption ?? '@playwright/test')
const { chromium } = await import(moduleSpecifier)
const launchOptions = {
  headless: true,
  ...(values['browser-path']
    ? { executablePath: path.resolve(values['browser-path']) }
    : {}),
}
if (!values['gates-only']) {
  try {
    await fs.access(path.join(out, 'raw', 'round-0.json'))
    throw new Error('Timing records already exist; use a new --artifact-root')
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error
    }
  }
}
await fs.mkdir(path.join(out, 'raw'), { recursive: true })
const provenanceBytes = await fs.readFile(provenancePath)
const provenanceSha256 = createHash('sha256')
  .update(provenanceBytes)
  .digest('hex')

const provenance = JSON.parse(provenanceBytes)
const arms = [
  'main',
  'pr8587',
  'pr8572',
  'pr8582',
  'H+E3+wrapper',
  'J',
  'K',
  'main-repeat',
]
if (
  JSON.stringify(provenance.records.map((record) => record.arm)) !==
  JSON.stringify(arms)
) {
  throw new Error(
    'Provenance must contain all eight focused arms, in frozen roster order',
  )
}
for (const record of provenance.records) {
  if (
    record.buildStatus !== 'pass' ||
    !/^[0-9a-f]{40}$/.test(record.head) ||
    !Object.keys(record.bundleHashes ?? {}).length ||
    !Object.keys(record.fixtureHashes ?? {}).length
  ) {
    throw new Error('Incomplete build provenance: ' + record.arm)
  }
  for (const [relative, expected] of Object.entries(record.bundleHashes)) {
    const file = path.resolve(bundleRoot, record.arm, relative)
    const armRoot = path.resolve(bundleRoot, record.arm) + path.sep
    if (!file.startsWith(armRoot)) {
      throw new Error('Invalid bundle provenance path: ' + relative)
    }
    const actual = createHash('sha256')
      .update(await fs.readFile(file))
      .digest('hex')
    if (actual !== expected) {
      throw new Error(
        'Bundle provenance hash mismatch: ' + record.arm + '/' + relative,
      )
    }
  }
}
const sortedHashes = (record) =>
  Object.entries(record.bundleHashes).sort(([a], [b]) => a.localeCompare(b))
if (
  JSON.stringify(sortedHashes(provenance.records[0])) !==
  JSON.stringify(sortedHashes(provenance.records[7]))
) {
  throw new Error('main-repeat must reuse exactly the main bundle bytes')
}
const apiNames = {
  browser: 'linkPresentationBenchmark',
  'no-links': 'linkPresentationNoLinks',
  'build-location': 'buildLocationBenchmark',
  'presentation-props': 'linkPresentationProps',
}
const gateCases = [
  ...[
    'departing',
    'retained-fixed',
    'retained-updaters',
    'fixed-path-updaters',
    'sparse-active-fixed',
    'nonroot-retained-updaters',
    'deep-retained-updaters',
  ].map((workload) => ({ group: 'browser', workload, file: 'index.html' })),
  ...['retained'].map((workload) => ({
    group: 'no-links',
    workload,
    file: 'no-links.html',
  })),
  ...['fresh-build', 'warm-hit', 'validated-build'].map((workload) => ({
    group: 'build-location',
    workload,
    file: 'build-location.html',
  })),
]
gateCases.push(
  ...['active-options', 'disabled-equivalent'].map((workload) => ({
    group: 'presentation-props',
    workload,
    file: 'presentation-props.html',
  })),
)
const cases = gateCases.filter((fixture) =>
  [
    'departing',
    'nonroot-retained-updaters',
    'deep-retained-updaters',
    'active-options',
    'disabled-equivalent',
  ].includes(fixture.workload),
)
const config = {
  rounds: 8,
  mainSentinel:
    'Embedded main-repeat identical A/A arm; no extra post-round sentinel',
  navigationWarmups: 16,
  navigationSamples: 24,
  navigationTraceSamples: 24,
  builderWarmups: 12,
  builderSamples: 24,
  warmHitBuilderWarmups: 6,
  warmHitBuilderSamples: 12,
  warmHitCallsPerBatch: 1000000,
  preloadLayout: 'intent',
  arms,
  cases,
  gateCases,
}
await fs.writeFile(
  path.join(out, 'design.json'),
  JSON.stringify(config, null, 2),
)
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1')
    const relative = decodeURIComponent(url.pathname).replace(/^\//, '')
    if (relative.includes('..')) {
      response.writeHead(400).end()
      return
    }
    const file = path.join(bundleRoot, relative)
    let content = await fs.readFile(file)
    if (file.endsWith('.html')) {
      const [arm, group] = relative.split('/')
      content = content
        .toString()
        .replaceAll('/assets/', `/${arm}/${group}/assets/`)
    }
    response.setHeader(
      'content-type',
      file.endsWith('.html')
        ? 'text/html'
        : file.endsWith('.js')
          ? 'text/javascript'
          : 'application/octet-stream',
    )
    response.end(content)
  } catch (error) {
    response.writeHead(404).end(String(error))
  }
})
await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${port}`
function watchdog(promise, label, ms = 60000) {
  let timer
  return Promise.race([
    promise,
    new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`Watchdog: ${label}`)), ms)
    }),
  ]).finally(() => clearTimeout(timer))
}
async function write(name, data) {
  await fs.writeFile(path.join(out, name), JSON.stringify(data, null, 2))
}
function containingTask(events, mark) {
  if (!mark) {
    return null
  }
  return events
    .filter(
      (event) =>
        event.ph === 'X' &&
        event.pid === mark.pid &&
        event.tid === mark.tid &&
        event.ts <= mark.ts &&
        event.ts + event.dur >= mark.ts &&
        ['RunTask', 'ThreadControllerImpl::RunTask'].includes(event.name),
    )
    .sort((a, b) => b.dur - a.dur)[0]
}
async function startTrace(page) {
  const cdp = await page.context().newCDPSession(page)
  const events = []
  cdp.on('Tracing.dataCollected', (data) => events.push(...data.value))
  await cdp.send('Tracing.start', {
    categories: 'toplevel,devtools.timeline,blink.user_timing',
    transferMode: 'ReportEvents',
  })
  return { cdp, events }
}
async function endTrace(trace) {
  if (trace.ended) {
    return
  }
  trace.ended = true
  const complete = new Promise((resolve) =>
    trace.cdp.once('Tracing.tracingComplete', resolve),
  )
  await trace.cdp.send('Tracing.end')
  await watchdog(complete, 'trace completion', 15000)
  await trace.cdp.detach()
}
function urlFor(arm, fixture) {
  return `${origin}/${arm}/${fixture.group}/${fixture.file}?case=${fixture.workload}&preload=intent`
}
async function newPage(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.benchmarkErrors = errors
  await page.goto(url, { waitUntil: 'load', timeout: 30000 })
  return page
}
async function preflight(page, fixture) {
  return watchdog(
    page.evaluate(async (name) => {
      const api = window[name]
      await api.ready
      const result = await api.preflight()
      if (name === 'buildLocationBenchmark') {
        let previous = performance.now(),
          minimum = Infinity,
          zeroReads = 0
        for (let index = 0; index < 50000; index++) {
          const now = performance.now(),
            delta = now - previous
          if (delta === 0) {
            zeroReads++
          } else {
            minimum = Math.min(minimum, delta)
          }
          previous = now
        }
        result.clockProbe = {
          reads: 50000,
          zeroReads,
          minimumPositiveMs: Number.isFinite(minimum) ? minimum : null,
        }
      }
      return result
    }, apiNames[fixture.group]),
    'preflight ' + fixture.workload,
  )
}
async function navigationSamples(page, fixture, count) {
  return watchdog(
    page.evaluate(
      async ({ name, count }) => {
        const samples = []
        for (let index = 0; index < count; index++) {
          samples.push(await window[name].sample())
        }
        return samples
      },
      { name: apiNames[fixture.group], count },
    ),
    'samples ' + fixture.workload,
  )
}
const diagnosticCases = gateCases
  .filter((fixture) => fixture.group === 'presentation-props')
  .map((fixture) => ({ ...fixture, diagnostic: true }))
const gatePath = path.join(out, 'gates.json')
let gates
if (values['reuse-gates']) {
  gates = JSON.parse(await fs.readFile(gatePath))
} else {
  gates = {
    records: [],
    failures: [],
    provenanceSha256,
    started: new Date().toISOString(),
  }
  const browser = await chromium.launch(launchOptions)
  gates.browserVersion = browser.version()
  for (const arm of arms) {
    console.log('GATE START', arm)
    for (const fixture of [...gateCases, ...diagnosticCases]) {
      let page
      try {
        page = await newPage(
          browser,
          urlFor(arm, fixture) + (fixture.diagnostic ? '&diagnostic=true' : ''),
        )
        const result = await preflight(page, fixture)
        if (page.benchmarkErrors.length) {
          throw new Error(page.benchmarkErrors.join('; '))
        }
        gates.records.push({ arm, ...fixture, status: 'pass', result })
      } catch (error) {
        gates.failures.push({
          arm,
          ...fixture,
          stage: 'preflight',
          error: String(error),
        })
      } finally {
        if (page) {
          await page.close()
        }
      }
      await write('gates.json', gates)
    }
    for (const kind of ['pending', 'cache-gate']) {
      let page, trace
      try {
        const group = kind === 'pending' ? 'browser' : 'cache-gate'
        page = await newPage(browser, `${origin}/${arm}/${group}/${kind}.html`)
        if (kind === 'pending') {
          trace = await startTrace(page)
        }
        const result = await watchdog(
          page.evaluate(
            async (name) => window[name].check(),
            kind === 'pending'
              ? 'linkPresentationPending'
              : 'linkPresentationCacheGate',
          ),
          'gate ' + kind,
        )
        if (trace) {
          await endTrace(trace)
          await fs.writeFile(
            path.join(out, 'raw', `${arm}-pending-trace.json.gz`),
            zlib.gzipSync(JSON.stringify(trace.events)),
          )
          const start = trace.events.find(
            (event) => event.name === 'pending-click-start',
          )
          const current = trace.events.find(
            (event) => event.name === 'pending-links-current',
          )
          const task = containingTask(trace.events, start)
          if (
            !start ||
            !current ||
            !task ||
            current.pid !== start.pid ||
            current.tid !== start.tid ||
            current.ts < start.ts ||
            current.ts > task.ts + task.dur
          ) {
            throw new Error(
              'Retained DOM did not become current before click task boundary',
            )
          }
          result.clickToLinksCurrentMs = (current.ts - start.ts) / 1000
          result.clickToTaskEndMs = (task.ts + task.dur - start.ts) / 1000
        }
        if (page.benchmarkErrors.length) {
          throw new Error(page.benchmarkErrors.join('; '))
        }
        gates.records.push({ arm, kind, status: 'pass', result })
      } catch (error) {
        gates.failures.push({ arm, kind, stage: 'gate', error: String(error) })
      } finally {
        if (trace && !trace.ended) {
          try {
            await endTrace(trace)
          } catch (error) {
            console.log('TRACE CLEANUP', String(error))
          }
        }
        if (trace) {
          await fs.writeFile(
            path.join(out, 'raw', `${arm}-pending-trace.json.gz`),
            zlib.gzipSync(JSON.stringify(trace.events)),
          )
        }
        if (page) {
          await page.close()
        }
      }
      await write('gates.json', gates)
    }
    console.log(
      'GATE END',
      arm,
      'failures',
      gates.failures
        .filter((item) => item.arm === arm)
        .map((item) => item.workload || item.kind),
    )
  }
  await browser.close()
  gates.finished = new Date().toISOString()
  await write('gates.json', gates)
}
if (gates.provenanceSha256 !== provenanceSha256) {
  server.close()
  throw new Error('Gate provenance does not match current bundles')
}
if (!gates.failures.length) {
  const expectedGateCount =
    arms.length * (gateCases.length + diagnosticCases.length + 2)
  const gateKey = (record) =>
    `${record.arm}/${record.kind ?? `${record.group}/${record.workload}/${Boolean(record.diagnostic)}`}`
  const expectedKeys = new Set(
    arms.flatMap((arm) => [
      ...gateCases.map((fixture) => gateKey({ arm, ...fixture })),
      ...diagnosticCases.map((fixture) => gateKey({ arm, ...fixture })),
      ...['pending', 'cache-gate'].map((kind) => gateKey({ arm, kind })),
    ]),
  )
  const actualKeys = gates.records.map(gateKey)
  if (
    gates.records.length !== expectedGateCount ||
    new Set(actualKeys).size !== expectedGateCount ||
    actualKeys.some((key) => !expectedKeys.has(key)) ||
    arms.some(
      (arm) =>
        gates.records.filter(
          (record) => record.arm === arm && record.status === 'pass',
        ).length !==
        expectedGateCount / arms.length,
    )
  ) {
    server.close()
    throw new Error('Missing or duplicate correctness gate records')
  }
}
if (values['gates-only']) {
  server.close()
  process.exit(gates.failures.length ? 1 : 0)
}
if (gates.failures.length) {
  server.close()
  throw new Error(
    'Correctness gates failed; timing requires an explicit reviewed arm set',
  )
}
// A complete even-n Williams design balances positions and immediate predecessors.
const offsets = [0]
for (let index = 1; index < arms.length; index++) {
  offsets.push(index % 2 ? (index + 1) / 2 : arms.length - index / 2)
}
const timingFailures = []
for (let block = 0; block < config.rounds; block++) {
  const browser = await chromium.launch(launchOptions)
  const order = offsets.map((offset) => arms[(offset + block) % arms.length])
  const measurementOrder = order
  const workloads = [
    ...cases.slice(block % cases.length),
    ...cases.slice(0, block % cases.length),
  ]
  const results = []
  console.log('ROUND START', block, order.join(','), new Date().toISOString())
  for (let position = 0; position < measurementOrder.length; position++) {
    const arm = measurementOrder[position]
    const sentinel = false
    console.log('ARM START', block, arm, new Date().toISOString())
    for (const fixture of workloads) {
      if (
        gates.failures.some(
          (item) =>
            item.arm === arm &&
            item.stage === 'preflight' &&
            item.group === fixture.group &&
            item.workload === fixture.workload,
        )
      ) {
        continue
      }
      let page, activeTrace
      const started = Date.now()
      try {
        page = await newPage(
          browser,
          urlFor(arm, fixture) + (fixture.diagnostic ? '&diagnostic=true' : ''),
        )
        const result = await preflight(page, fixture)
        let samples, traceSamples
        if (fixture.group === 'build-location') {
          samples = await watchdog(
            page.evaluate(
              async ({ workload, warmups, count }) => {
                for (let index = 0; index < warmups; index++) {
                  window.buildLocationBenchmark.sample(workload)
                  await new Promise((resolve) => setTimeout(resolve, 0))
                }
                const samples = []
                for (let index = 0; index < count; index++) {
                  samples.push(window.buildLocationBenchmark.sample(workload))
                  await new Promise((resolve) => setTimeout(resolve, 0))
                }
                return samples
              },
              {
                workload: fixture.workload,
                warmups:
                  fixture.workload === 'warm-hit'
                    ? config.warmHitBuilderWarmups
                    : config.builderWarmups,
                count:
                  fixture.workload === 'warm-hit'
                    ? config.warmHitBuilderSamples
                    : config.builderSamples,
              },
            ),
            'builder ' + fixture.workload,
          )
        } else {
          await navigationSamples(page, fixture, config.navigationWarmups)
          samples = await navigationSamples(
            page,
            fixture,
            config.navigationSamples,
          )
          const trace = await startTrace(page)
          activeTrace = trace
          const traced = await navigationSamples(
            page,
            fixture,
            config.navigationTraceSamples,
          )
          await endTrace(trace)
          const traceName = `raw/round-${block}-${arm}-${sentinel ? 'sentinel-' : ''}${fixture.group}-${fixture.workload}-trace.json.gz`
          await fs.writeFile(
            path.join(out, traceName),
            zlib.gzipSync(JSON.stringify(trace.events)),
          )
          traceSamples = traced.map((sample) => {
            const mark = trace.events.find(
              (event) => event.name === `link-click-start-${sample.sampleId}`,
            )
            const task = containingTask(trace.events, mark)
            if (!task) {
              throw new Error(
                'Missing enclosing click task: ' + sample.sampleId,
              )
            }
            return {
              ...sample,
              enclosingTask: {
                name: task.name,
                durationMs: task.dur / 1000,
                clickToTaskEndMs: (task.ts + task.dur - mark.ts) / 1000,
              },
              traceName,
            }
          })
        }
        if (page.benchmarkErrors.length) {
          throw new Error(page.benchmarkErrors.join('; '))
        }
        results.push({
          arm,
          block,
          position,
          sentinel,
          ...fixture,
          preloadLayout: ['browser', 'presentation-props'].includes(
            fixture.group,
          )
            ? 'intent'
            : null,
          preflight: result,
          samples,
          traceSamples,
          elapsedMs: Date.now() - started,
        })
      } catch (error) {
        const failure = {
          block,
          arm,
          ...fixture,
          error: String(error),
          timestamp: new Date().toISOString(),
        }
        timingFailures.push(failure)
        console.log('TIMING FAIL', JSON.stringify(failure))
        await write('timing-failures.json', timingFailures)
      } finally {
        if (activeTrace && !activeTrace.ended) {
          try {
            await endTrace(activeTrace)
          } catch (error) {
            console.log('TRACE CLEANUP', String(error))
          }
          await fs.writeFile(
            path.join(
              out,
              'raw',
              `round-${block}-${arm}-${fixture.group}-${fixture.workload}-failed-trace.json.gz`,
            ),
            zlib.gzipSync(JSON.stringify(activeTrace.events)),
          )
        }
        if (page) {
          await page.close()
        }
      }
      await write(`raw/round-${block}.json`, {
        block,
        order,
        workloads,
        browserVersion: browser.version(),
        results,
      })
    }
    console.log('ARM END', block, arm, new Date().toISOString())
  }
  await browser.close()
  console.log('ROUND END', block, new Date().toISOString())
}
await write('timing-failures.json', timingFailures)
server.close()
console.log('MEASUREMENT COMPLETE', new Date().toISOString())
if (timingFailures.length) {
  process.exitCode = 1
}
