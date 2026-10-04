/**
 * Paired Solid measurement of the `lane-*` Link ownership workloads (see the
 * React `link-performance` suite): 1,000 Links in a staying `/lane` layout
 * and/or a departing `/lane/a` leaf, navigating `/lane/a` <-> `/lane/b`.
 *
 *   node run.ts measure-all <bundle>
 *   node run.ts compare <baseline bundle> <candidate bundle> [rounds]
 *
 * `LANE_PRELOAD=intent` measures with `defaultPreload: 'intent'` (the usual app
 * configuration) instead of Links that opt out of preloading, and
 * `LANE_CASES=a,b` limits the cases.
 *
 * Each sample is a fresh process that warms up, then times navigations from a
 * settled, garbage-collected app: `syncMs` ends at the first macrotask after
 * the click (INP processing), `totalMs` at `onRendered`. Without loaders a
 * navigation renders within its click task, so the two coincide.
 */
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

declare const gc: () => void

type Phase = { syncMs: number; totalMs: number }
type Sample = Record<'a->b' | 'b->a', Phase>

const WARMUP = 50
const MEASURED = 100
const CASES = process.env.LANE_CASES?.split(',') ?? [
  'lane-departing',
  'lane-retained',
  'lane-retained-updaters',
  'lane-mixed',
]

async function measure(bundle: string, caseId: string): Promise<Sample> {
  await import(pathToFileURL(resolve(import.meta.dirname, '../jsdom.ts')).href)
  const app = await import(pathToFileURL(resolve(bundle)).href)
  const container = document.createElement('div')
  document.body.append(container)
  const { router, unmount } = app.mountLaneApp(container, caseId, {
    preload: process.env.LANE_PRELOAD,
  })
  await router.load()
  let resolveRendered = () => {}
  router.subscribe('onRendered', () => resolveRendered())
  const nextMacrotask = () =>
    new Promise<number>((done) => setImmediate(() => done(performance.now())))
  const sample: Sample = {
    'a->b': { syncMs: 0, totalMs: 0 },
    'b->a': { syncMs: 0, totalMs: 0 },
  }
  for (let index = 0; index < 2 * (WARMUP + MEASURED); index++) {
    const toB = index % 2 === 0
    const link = container.querySelector(
      `[data-testid="go-${toB ? 'b' : 'a'}"]`,
    )!
    const rendered = new Promise<void>((done) => (resolveRendered = done))
    const firstTask = nextMacrotask()
    const start = performance.now()
    link.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
    )
    await rendered
    const end = performance.now()
    const syncEnd = Math.min(await firstTask, end)
    // Let follow-up work settle, and collect the previous navigation's
    // garbage, before the next navigation.
    for (let hop = 0; hop < 4; hop++) {
      await nextMacrotask()
    }
    gc()
    const expected = toB ? '/lane/b' : '/lane/a'
    if (router.state.location.pathname !== expected) {
      throw new Error(`Expected ${expected}, got ${router.state.location.href}`)
    }
    if (index >= 2 * WARMUP) {
      const phase = sample[toB ? 'a->b' : 'b->a']
      phase.syncMs += (syncEnd - start) / MEASURED
      phase.totalMs += (end - start) / MEASURED
    }
  }
  unmount()
  return sample
}

function child(bundle: string, caseId: string): Sample {
  const out = execFileSync(
    process.execPath,
    ['--expose-gc', import.meta.filename, 'measure', bundle, caseId],
    { encoding: 'utf8', env: { ...process.env, NODE_ENV: 'production' } },
  )
  return JSON.parse(out.trim().split('\n').pop()!)
}

function stats(values: Array<number>) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const sd = Math.sqrt(
    values.reduce((a, b) => a + (b - mean) ** 2, 0) /
      Math.max(1, values.length - 1),
  )
  // Two-sided 95% t quantile for n - 1 degrees of freedom.
  const t =
    [12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262][
      values.length - 2
    ] ?? 2.262
  return { mean, sd, ci95: (t * sd) / Math.sqrt(values.length) }
}

const [mode, ...args] = process.argv.slice(2)
if (mode === 'measure') {
  const sample = await measure(args[0]!, args[1]!)
  process.stdout.write(`${JSON.stringify(sample)}\n`)
  process.exit(0)
} else if (mode === 'measure-all') {
  for (const caseId of CASES) {
    const sample = child(args[0]!, caseId)
    for (const [direction, phase] of Object.entries(sample)) {
      console.log(
        `${caseId} ${direction}: sync ${phase.syncMs.toFixed(3)} ms, total ${phase.totalMs.toFixed(3)} ms`,
      )
    }
  }
} else if (mode === 'compare') {
  const [baseline, candidate, rounds = '10'] = args
  const rows: Array<string> = [
    '| case | direction | metric | baseline ms (mean ± sd) | candidate ms (mean ± sd) | change (95% CI of paired diff) |',
    '| --- | --- | --- | --- | --- | --- |',
  ]
  for (const caseId of CASES) {
    const samples: Array<[Sample, Sample]> = []
    for (let round = 0; round < Number(rounds); round++) {
      // Alternate which variant runs first in each round.
      const pair =
        round % 2 === 0
          ? ([child(baseline!, caseId), child(candidate!, caseId)] as const)
          : ([child(candidate!, caseId), child(baseline!, caseId)] as const)
      samples.push(round % 2 === 0 ? [pair[0], pair[1]] : [pair[1], pair[0]])
    }
    for (const direction of ['a->b', 'b->a'] as const) {
      for (const metric of ['syncMs', 'totalMs'] as const) {
        const b = stats(samples.map(([base]) => base[direction][metric]))
        const c = stats(samples.map(([, cand]) => cand[direction][metric]))
        const d = stats(
          samples.map(
            ([base, cand]) => cand[direction][metric] - base[direction][metric],
          ),
        )
        const pct = (value: number) => `${((value / b.mean) * 100).toFixed(1)}%`
        rows.push(
          `| ${caseId} | ${direction} | ${metric} | ${b.mean.toFixed(3)} ± ${b.sd.toFixed(3)} | ${c.mean.toFixed(3)} ± ${c.sd.toFixed(3)} | ${pct(d.mean)} [${pct(d.mean - d.ci95)}, ${pct(d.mean + d.ci95)}] |`,
        )
      }
    }
    console.error(`done ${caseId}`)
  }
  console.log(rows.join('\n'))
} else {
  throw new Error('Usage: run.ts measure-all <bundle> | compare <a> <b> [n]')
}
