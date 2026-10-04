/**
 * Real-browser Link click cost, baseline vs candidate (see README.md).
 *
 *   node run.ts [--frameworks react,solid] [--cases lane-departing,...]
 *     [--loaders 0,50] [--throttle 1,4] [--rounds 6] [--warmup 10]
 *     [--navigations 40] [--out results/<name>]
 *
 * Each round loads every configuration once per arm in fresh browser
 * contexts, alternating which arm goes first, and performs real mouse clicks
 * on a control Link that navigates `/lane/a` <-> `/lane/b`. Rounds pair the
 * two arms' page loads of one configuration; statistics use per-page medians.
 */
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:http'
import { loadavg } from 'node:os'
import { extname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { chromium } from '@playwright/test'
import { CASES } from './shared/cases.ts'
import type { AddressInfo } from 'node:net'
import type { Browser } from '@playwright/test'
import type { CaseId, PageConfig } from './shared/cases.ts'
import type { Leaf, ProbeSample } from './shared/probe.ts'

const harnessDir = import.meta.dirname
const ARMS = ['baseline', 'candidate'] as const
type Arm = (typeof ARMS)[number]
type Framework = 'react' | 'solid'

const { values: args } = parseArgs({
  options: {
    frameworks: { type: 'string', default: 'react,solid' },
    cases: { type: 'string', default: CASES.join(',') },
    loaders: { type: 'string', default: '0,50' },
    throttle: { type: 'string', default: '1,4' },
    rounds: { type: 'string', default: '6' },
    warmup: { type: 'string', default: '10' },
    navigations: { type: 'string', default: '40' },
    out: { type: 'string' },
    // `chromium` runs the full browser in new headless mode instead of the
    // headless shell.
    channel: { type: 'string' },
    'chrome-args': { type: 'string', default: '' },
    // A/A calibration: serve the baseline build to both arms.
    aa: { type: 'boolean', default: false },
    // Re-render the report of a saved `<name>.json` instead of measuring.
    from: { type: 'string' },
    // Continue an interrupted `<name>.json` with the same options and builds.
    resume: { type: 'string' },
  },
})
// Lists take `,` or `+`: Nx splits `--args` values on commas.
const list = (value: string) => value.split(/[,+]/).filter(Boolean)
const frameworks = list(args.frameworks) as Array<Framework>
const cases = list(args.cases) as Array<CaseId>
const loaders = list(args.loaders).map(Number)
const throttles = list(args.throttle).map(Number)
const rounds = Number(args.rounds)
const warmup = Number(args.warmup)
const navigations = Number(args.navigations)
for (const caseId of cases) {
  if (!CASES.includes(caseId)) {
    throw new Error(`Unknown case ${caseId}`)
  }
}
const outBase = resolve(
  harnessDir,
  args.out ?? `results/${new Date().toISOString().replace(/[:.]/g, '-')}`,
)

// ---------------------------------------------------------------------------
// Static servers: one origin per arm and framework, history API fallback.

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.map': 'application/json',
}

async function serve(dir: string) {
  if (!existsSync(join(dir, 'index.html'))) {
    throw new Error(`Missing build ${dir}; run the build targets first`)
  }
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname
    let file = resolve(dir, `.${path}`)
    if (
      !file.startsWith(dir) ||
      !existsSync(file) ||
      !statSync(file).isFile()
    ) {
      file = join(dir, 'index.html')
    }
    response.writeHead(200, {
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    })
    createReadStream(file).pipe(response)
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  return {
    origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => server.close(),
  }
}

// ---------------------------------------------------------------------------
// One page load: warm up, then measure alternating navigations.

interface PageResult {
  samples: Array<ProbeSample>
  loadavg: number
  errors: Array<string>
}

function expectedCensus(caseId: CaseId) {
  const [layout, leaf] =
    caseId === 'lane-retained'
      ? [1_000, 0]
      : caseId === 'lane-mixed'
        ? [500, 500]
        : [0, 1_000]
  // Fixed Links: 20 per 1,000 target `/lane/a`.
  return {
    path: '/lane/a',
    layout,
    leaf,
    active: caseId === 'lane-departing-updaters' ? undefined : 20,
    leafA: true,
    leafB: false,
  }
}

async function measurePage(
  browser: Browser,
  origin: string,
  config: PageConfig,
  throttle: number,
): Promise<PageResult> {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  })
  const errors: Array<string> = []
  try {
    const page = await context.newPage()
    page.on('pageerror', (error) => errors.push(String(error)))
    page.on('console', (message) => {
      if (message.type() === 'error') {
        errors.push(message.text())
      }
    })
    const cdp = await context.newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle })
    await page.addInitScript((value) => {
      window.__LINK_INP_CONFIG__ = value
    }, config)
    await page.goto(`${origin}/lane/a`)
    await page.waitForSelector('[data-leaf="a"]', { state: 'attached' })
    const census = async () =>
      JSON.stringify(await page.evaluate(() => window.__linkInp!.census()))
    const expected = expectedCensus(config.caseId)
    const check = async (when: string) => {
      const actual = JSON.parse(await census())
      for (const [key, value] of Object.entries(expected)) {
        if (value !== undefined && actual[key] !== value) {
          throw new Error(
            `${when}: unexpected page state ${JSON.stringify(actual)}`,
          )
        }
      }
    }
    await check('before')
    const controls = await page.evaluate(() => window.__linkInp!.controls())
    const samples: Array<ProbeSample> = []
    const load = loadavg()[0]!
    for (let index = 0; index < 2 * warmup + navigations; index++) {
      const dest: Leaf = index % 2 === 0 ? 'b' : 'a'
      await page.evaluate((leaf) => window.__linkInp!.prepare(leaf), dest)
      await page.mouse.click(controls[dest]!.x, controls[dest]!.y)
      const sample = await page.evaluate(() => window.__linkInp!.collect())
      if (index >= 2 * warmup) {
        samples.push(sample)
      }
    }
    // An even number of navigations ends on `/lane/a` again.
    await check('after')
    const rendered = median(samples.map((sample) => sample.renderedMs))
    if (config.loaderMs && rendered < config.loaderMs) {
      throw new Error(`Rendered after ${rendered} ms, before the loader`)
    }
    return { samples, loadavg: load, errors }
  } finally {
    await context.close()
  }
}

// ---------------------------------------------------------------------------
// Statistics.

const METRICS = {
  clickTaskMs: 'Click task: listeners and their microtasks (script, ms)',
  interactionMs: 'Event Timing interaction duration (INP, ms)',
  clickProcessingMs: 'Event Timing click processing (ms)',
  frameMs: 'Click to next frame (script, ms)',
  renderedMs: 'Click to destination in DOM (script, ms)',
  firstTaskMs: 'Click to first MessageChannel task (script, ms)',
} as const
/** Metrics of the headline table. */
const HEADLINE: Array<Metric> = [
  'clickTaskMs',
  'interactionMs',
  'frameMs',
  'renderedMs',
]
type Metric = keyof typeof METRICS

/**
 * Event Timing only reports entries of 16 ms or more: a missing interaction
 * counts as 8 ms and a missing click processing time is unknown.
 */
const CENSORED_DURATION = 8

function metricValue(sample: ProbeSample, metric: Metric): number | null {
  switch (metric) {
    case 'interactionMs':
      return sample.entries.length
        ? Math.max(...sample.entries.map((entry) => entry.duration))
        : CENSORED_DURATION
    case 'clickProcessingMs':
      return (
        sample.entries.find((entry) => entry.name === 'click')?.processing ??
        null
      )
    default:
      return sample[metric]
  }
}

function quantile(values: Array<number>, q: number) {
  const sorted = [...values].sort((a, b) => a - b)
  const position = (sorted.length - 1) * q
  const low = Math.floor(position)
  const high = Math.ceil(position)
  return sorted[low]! + (sorted[high]! - sorted[low]!) * (position - low)
}
const median = (values: Array<number>) => quantile(values, 0.5)
const mean = (values: Array<number>) =>
  values.reduce((sum, value) => sum + value, 0) / values.length
function sd(values: Array<number>) {
  const m = mean(values)
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - m) ** 2, 0) /
      (values.length - 1),
  )
}
// Two-sided 97.5% Student t quantiles for 1..30 degrees of freedom.
const T975 = [
  12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201,
  2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074,
  2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042,
]
function meanInterval(values: Array<number>) {
  const m = mean(values)
  if (values.length < 2) {
    return { mean: m, low: NaN, high: NaN }
  }
  const half =
    (T975[values.length - 2] ?? 1.96) * (sd(values) / Math.sqrt(values.length))
  return { mean: m, low: m - half, high: m + half }
}

interface ArmSummary {
  /** Pooled mean for Event Timing durations, pooled median otherwise. */
  center: number
  median: number
  mean: number
  n: number
  censored: number
}

interface Comparison {
  pairs: number
  baseline: ArmSummary
  candidate: ArmSummary
  /** Mean over pairs of candidate - baseline page centers, ms, 95% CI. */
  deltaMs: { mean: number; low: number; high: number }
  /** Geometric mean over pairs of candidate / baseline page centers - 1. */
  change: { mean: number; low: number; high: number }
  /** Between-page coefficient of variation of baseline page centers. */
  baselinePageCv: number
}

/**
 * Event Timing durations come in 8 ms buckets, so pages and arms compare their
 * means, which resolve shifts smaller than a bucket; other metrics use medians.
 */
const center = (metric: Metric) => (metric === 'interactionMs' ? mean : median)

function compare(
  pages: Record<Arm, Array<Array<ProbeSample>>>,
  metric: Metric,
): Comparison | undefined {
  const statistic = center(metric)
  const values = (samples: Array<ProbeSample>) =>
    samples
      .map((sample) => metricValue(sample, metric))
      .filter((value): value is number => value !== null)
  const pagesOf = (arm: Arm) => pages[arm].map(values)
  const base = pagesOf('baseline')
  const cand = pagesOf('candidate')
  const pairs = Math.min(base.length, cand.length)
  const deltas: Array<number> = []
  const logs: Array<number> = []
  for (let index = 0; index < pairs; index++) {
    if (base[index]!.length && cand[index]!.length) {
      const b = statistic(base[index]!)
      const c = statistic(cand[index]!)
      deltas.push(c - b)
      logs.push(Math.log(c / b))
    }
  }
  if (!deltas.length) {
    return undefined
  }
  const summary = (arm: Arm, perPage: Array<Array<number>>) => {
    const all = perPage.flat()
    const total = pages[arm].flat().length
    const censored =
      metric === 'interactionMs'
        ? pages[arm].flat().filter((sample) => !sample.entries.length).length
        : total - all.length
    return {
      center: statistic(all),
      median: median(all),
      mean: mean(all),
      n: all.length,
      censored: censored / total,
    }
  }
  const pct = meanInterval(logs)
  const basePageCenters = base.filter((page) => page.length).map(statistic)
  return {
    pairs: deltas.length,
    baseline: summary('baseline', base),
    candidate: summary('candidate', cand),
    deltaMs: meanInterval(deltas),
    change: {
      mean: Math.exp(pct.mean) - 1,
      low: Math.exp(pct.low) - 1,
      high: Math.exp(pct.high) - 1,
    },
    baselinePageCv: sd(basePageCenters) / mean(basePageCenters),
  }
}

// ---------------------------------------------------------------------------
// Run.

if (args.from) {
  const saved = JSON.parse(readFileSync(resolve(args.from), 'utf8'))
  writeReport(
    saved.raw,
    saved.meta,
    saved.meta.completedRounds,
    resolve(args.from).replace(/\.json$/, ''),
  )
  process.exit(0)
}

interface ConfigResult {
  framework: Framework
  caseId: CaseId
  loaderMs: number
  throttle: number
  pages: Record<Arm, Array<PageResult>>
}

const configs: Array<Omit<ConfigResult, 'pages'>> = []
for (const throttle of throttles) {
  for (const framework of frameworks) {
    for (const caseId of cases) {
      for (const loaderMs of loaders) {
        configs.push({ framework, caseId, loaderMs, throttle })
      }
    }
  }
}
const results: Array<ConfigResult> = configs.map((config) => ({
  ...config,
  pages: { baseline: [], candidate: [] },
}))
const resumed = args.resume
  ? JSON.parse(readFileSync(resolve(args.resume), 'utf8'))
  : undefined
const firstRound: number = resumed?.meta.completedRounds ?? 0

const manifests = Object.fromEntries(
  ARMS.map((arm) => [
    arm,
    JSON.parse(
      readFileSync(join(harnessDir, 'dist', arm, 'manifest.json'), 'utf8'),
    ),
  ]),
)
const armBuild = (arm: Arm): Arm => (args.aa ? 'baseline' : arm)
for (const framework of frameworks) {
  if (
    !args.aa &&
    manifests.baseline.bundles[framework] ===
      manifests.candidate.bundles[framework]
  ) {
    throw new Error(`The ${framework} arms bundle identical code`)
  }
}

const servers = Object.fromEntries(
  await Promise.all(
    ARMS.flatMap((arm) =>
      frameworks.map(
        async (framework) =>
          [
            `${arm}/${framework}`,
            await serve(join(harnessDir, 'dist', armBuild(arm), framework)),
          ] as const,
      ),
    ),
  ),
)

const browser = await chromium.launch({
  headless: true,
  channel: args.channel,
  args: [
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    ...list(args['chrome-args']),
  ],
})
const meta = {
  startedAt: resumed?.meta.startedAt ?? new Date().toISOString(),
  resumedAt: resumed ? [new Date().toISOString()] : [],
  finishedAt: '',
  browser: `${browser.browserType().name()} ${browser.version()}`,
  options: {
    frameworks,
    cases,
    loaders,
    throttles,
    rounds,
    warmup,
    navigations,
    channel: args.channel,
    chromeArgs: list(args['chrome-args']),
    aa: args.aa,
  },
  manifests,
  loadavg: { start: loadavg(), end: [] as Array<number> },
}

if (resumed) {
  const same = (a: unknown, b: unknown) =>
    JSON.stringify(a) === JSON.stringify(b)
  const { options } = resumed.meta
  if (
    !same({ ...options, rounds: 0 }, { ...meta.options, rounds: 0 }) ||
    !same(
      ARMS.map((arm) => resumed.meta.manifests[arm].bundles),
      ARMS.map((arm) => manifests[arm].bundles),
    )
  ) {
    throw new Error('--resume needs the same options and builds')
  }
  // Drop pages of the interrupted round so every round stays paired.
  for (const [index, result] of results.entries()) {
    for (const arm of ARMS) {
      result.pages[arm] = resumed.raw[index].pages[arm].slice(0, firstRound)
    }
  }
  meta.resumedAt.unshift(...(resumed.meta.resumedAt ?? []))
}

mkdirSync(resolve(outBase, '..'), { recursive: true })
const started = Date.now()
try {
  for (let round = firstRound; round < rounds; round++) {
    for (const [index, result] of results.entries()) {
      const arms = (round + index) % 2 ? [...ARMS].reverse() : ARMS
      const config = { caseId: result.caseId, loaderMs: result.loaderMs }
      for (const arm of arms) {
        const origin = servers[`${arm}/${result.framework}`]!.origin
        let page: PageResult | undefined
        for (let attempt = 0; !page; attempt++) {
          try {
            page = await measurePage(browser, origin, config, result.throttle)
          } catch (error) {
            if (attempt) {
              throw error
            }
            console.warn(`retrying after: ${String(error)}`)
          }
        }
        if (page.errors.length) {
          throw new Error(`Page errors: ${page.errors.join('\n')}`)
        }
        result.pages[arm].push(page)
      }
      const tasks = ARMS.map((arm) =>
        median(
          result.pages[arm]
            .at(-1)!
            .samples.map((sample) => sample.clickTaskMs ?? NaN),
        ).toFixed(1),
      )
      console.log(
        `[${((Date.now() - started) / 60_000).toFixed(1)} min] round ${round + 1}/${rounds} ` +
          `${result.framework} ${result.caseId} loader=${result.loaderMs} x${result.throttle}: ` +
          `click task median base ${tasks[0]} / cand ${tasks[1]} ms (load ${loadavg()[0]!.toFixed(1)})`,
      )
    }
    meta.finishedAt = new Date().toISOString()
    meta.loadavg.end = loadavg()
    writeReport(results, meta, round + 1, outBase)
  }
} finally {
  await browser.close()
  for (const server of Object.values(servers)) {
    server.close()
  }
}

// ---------------------------------------------------------------------------
// Report.

function format(value: number, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : 'n/a'
}
function percent(value: number) {
  return Number.isFinite(value)
    ? `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`
    : 'n/a'
}

type RunMeta = typeof meta

function share(value: number) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : 'n/a'
}

function writeReport(
  results: Array<ConfigResult>,
  meta: RunMeta,
  completedRounds: number,
  outBase: string,
) {
  const { throttles, rounds, warmup, navigations, aa } = meta.options
  const { manifests } = meta
  const comparisons = results.flatMap((result) =>
    (['b', 'a'] as const).map((dest) => {
      const pages = Object.fromEntries(
        ARMS.map((arm) => [
          arm,
          result.pages[arm].map((page) =>
            page.samples.filter((sample) => sample.dest === dest),
          ),
        ]),
      ) as Record<Arm, Array<Array<ProbeSample>>>
      return {
        framework: result.framework,
        caseId: result.caseId,
        loaderMs: result.loaderMs,
        throttle: result.throttle,
        direction: dest === 'b' ? 'a->b' : 'b->a',
        metrics: Object.fromEntries(
          (Object.keys(METRICS) as Array<Metric>).map((metric) => [
            metric,
            compare(pages, metric),
          ]),
        ),
      }
    }),
  )
  const loads = results.flatMap((result) =>
    ARMS.flatMap((arm) => result.pages[arm].map((page) => page.loadavg)),
  )
  writeFileSync(
    `${outBase}.json`,
    JSON.stringify(
      { meta: { ...meta, completedRounds }, comparisons, raw: results },
      null,
      1,
    ),
  )

  const lines = [
    `# Link click cost in Chromium: ${aa ? 'A/A calibration (baseline vs baseline)' : 'baseline vs candidate'}`,
    '',
    `- Browser: ${meta.browser}; ${completedRounds}/${rounds} rounds; ${warmup} warm-up round trips and ${navigations} measured navigations per page load.`,
    `- Baseline ${manifests.baseline.commit.slice(0, 10)} (${manifests.baseline.packagesRoot}); candidate ${manifests.candidate.commit.slice(0, 10)}${manifests.candidate.dirtySources ? ' with uncommitted router sources' : ''}.`,
    `- 1-minute load average per page: min ${format(Math.min(...loads))}, median ${format(median(loads))}, max ${format(Math.max(...loads))}.`,
    '- Each arm shows the median of all its samples. Δ is the mean over rounds of the paired difference of per-page medians (ms) and their geometric mean ratio (%), with 95% t intervals. Page CV is the between-page coefficient of variation of the baseline page medians.',
    `- Event Timing durations come in 8 ms buckets, so they use means instead of medians. Only interactions of 16 ms or more are reported; a missing one counts as ${CENSORED_DURATION} ms ("<16" share in brackets).`,
    '',
  ]
  const loader = (row: { loaderMs: number }) =>
    row.loaderMs ? `${row.loaderMs} ms` : 'none'
  for (const throttle of throttles) {
    lines.push(
      `## CPU throttling ${throttle}x`,
      '',
      'Baseline → candidate medians (Event Timing: means) in ms and paired Δ %; `*` marks a 95% interval excluding 0.',
      '',
      `| Framework | Case | Loader | Direction | ${HEADLINE.map((metric) => METRICS[metric].replace(/ \(.*\)$/, '')).join(' | ')} |`,
      `| --- | --- | --- | --- | ${HEADLINE.map(() => '---').join(' | ')} |`,
    )
    for (const row of comparisons) {
      if (row.throttle !== throttle) {
        continue
      }
      const cells = HEADLINE.map((metric) => {
        const stats = row.metrics[metric]
        if (!stats) {
          return 'n/a'
        }
        const significant = stats.change.low > 0 || stats.change.high < 0
        return `${format(stats.baseline.center)} → ${format(stats.candidate.center)} (${percent(stats.change.mean)}${significant ? '*' : ''})`
      })
      lines.push(
        `| ${row.framework} | ${row.caseId} | ${loader(row)} | ${row.direction} | ${cells.join(' | ')} |`,
      )
    }
    const noise = HEADLINE.map((metric) => {
      const stats = comparisons
        .filter((row) => row.throttle === throttle)
        .map((row) => row.metrics[metric])
        .filter((value) => value !== undefined)
      return `${METRICS[metric].replace(/ \(.*\)$/, '')}: page CV ${share(median(stats.map((value) => value.baselinePageCv)))}, Δ % half-width ${share(median(stats.map((value) => (value.change.high - value.change.low) / 2)))}`
    })
    lines.push('', `Noise (medians over rows): ${noise.join('; ')}.`, '')
    for (const metric of Object.keys(METRICS) as Array<Metric>) {
      lines.push(
        `### ${METRICS[metric]}, ${throttle}x`,
        '',
        '| Framework | Case | Loader | Direction | Baseline | Candidate | Δ ms [95% CI] | Δ % [95% CI] | Page CV |',
        '| --- | --- | --- | --- | ---: | ---: | --- | --- | ---: |',
      )
      for (const row of comparisons) {
        const stats = row.metrics[metric]
        if (row.throttle !== throttle || !stats) {
          continue
        }
        const censored = (arm: 'baseline' | 'candidate') =>
          metric === 'interactionMs' && stats[arm].censored
            ? ` (<16: ${Math.round(stats[arm].censored * 100)}%)`
            : ''
        lines.push(
          `| ${row.framework} | ${row.caseId} | ${loader(row)} | ${row.direction} | ` +
            `${format(stats.baseline.center)}${censored('baseline')} | ${format(stats.candidate.center)}${censored('candidate')} | ` +
            `${format(stats.deltaMs.mean, 2)} [${format(stats.deltaMs.low, 2)}, ${format(stats.deltaMs.high, 2)}] | ` +
            `${percent(stats.change.mean)} [${percent(stats.change.low)}, ${percent(stats.change.high)}] | ${share(stats.baselinePageCv)} |`,
        )
      }
      lines.push('')
    }
  }
  writeFileSync(`${outBase}.md`, lines.join('\n'))
  console.log(`Wrote ${outBase}.json and ${outBase}.md`)
}
