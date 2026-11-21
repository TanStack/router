#!/usr/bin/env node
// Analysis of soak series (run.mjs `--scenarios soak`, soak-*.json).
//
// Usage: node soak-analyze.mjs <soak-*.json>... [--md out.md] [--json out.json]
//
// - Memory: ordinary least squares of each GC'd metric against the cycle
//   over the last 75% of the samples (the first quarter is warm-up), slope
//   in KB per edit cycle with a 95% confidence interval (Student t).
// - Compiler caches (TSR_COMPILER_STATS): per label and counter, the value
//   after the first sample past warm-up and at the end, the maximum, and the
//   slope (per 100 cycles) with its CI over the same window; a counter
//   "grows" when the lower CI bound is above zero and the last value exceeds
//   the warm value.

import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: { md: { type: 'string' }, json: { type: 'string' } },
})

// Two-sided 97.5% quantiles of Student's t by degrees of freedom.
const T975 = [
  0, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228,
  2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08,
  2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042,
]
const t975 = (df) => (df < T975.length ? T975[df] : 1.96 + 2.4 / df)

export function regression(xs, ys) {
  const n = xs.length
  if (n < 3) {
    return null
  }
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let sxx = 0
  let sxy = 0
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2
    sxy += (xs[i] - mx) * (ys[i] - my)
  }
  const slope = sxx ? sxy / sxx : 0
  const intercept = my - slope * mx
  let sse = 0
  for (let i = 0; i < n; i++) {
    sse += (ys[i] - (intercept + slope * xs[i])) ** 2
  }
  const se = sxx ? Math.sqrt(sse / (n - 2) / sxx) : 0
  const half = t975(n - 2) * se
  return { n, slope, lo: slope - half, hi: slope + half, intercept }
}

const MEM = ['heapUsedMb', 'externalMb', 'arrayBuffersMb', 'rssMb']

export function analyze(soak) {
  const series = soak.series
  const start = Math.floor(series.length / 4)
  const window = series.slice(start)
  const xs = window.map((s) => s.cycle)
  const memory = {}
  for (const key of MEM) {
    const r = regression(
      xs,
      window.map((s) => s[key] * 1024),
    )
    memory[key] = r && {
      kbPerEdit: round(r.slope, 3),
      ci95: [round(r.lo, 3), round(r.hi, 3)],
      first: series[0][key],
      warm: series[start][key],
      last: series.at(-1)[key],
      max: Math.max(...series.map((s) => s[key])),
      n: r.n,
    }
  }
  const caches = {}
  const labels = new Set(series.flatMap((s) => Object.keys(s.stats ?? {})))
  for (const label of labels) {
    const counters = new Set(
      series.flatMap((s) => Object.keys(s.stats?.[label] ?? {})),
    )
    for (const counter of counters) {
      const value = (s) => s.stats?.[label]?.[counter] ?? 0
      const r = regression(
        xs,
        window.map((s) => value(s)),
      )
      const warm = value(series[start])
      const last = value(series.at(-1))
      const per100 = r ? r.slope * 100 : 0
      caches[`${label}.${counter}`] = {
        first: value(series[0]),
        warm,
        last,
        max: Math.max(...series.map(value)),
        per100Cycles: round(per100, 2),
        ci95: r ? [round(r.lo * 100, 2), round(r.hi * 100, 2)] : null,
        grows: Boolean(r && r.lo > 0 && last > warm),
      }
    }
  }
  return {
    name: `${soak.variant}/soak-${soak.bundler}${soak.mode === 'real' ? '' : `-${soak.mode}`}`,
    cycles: soak.cycles,
    samples: series.length,
    window: `cycles ${xs[0]}–${xs.at(-1)}`,
    failures: soak.failures.length,
    failureKinds: soak.failures.map((f) => `${f.cycle}:${f.kind}`),
    pageErrors: soak.pageErrors,
    cycleMsMedian: soak.cycleMsMedian,
    live: { first: series[0].live, last: series.at(-1).live },
    memory,
    caches,
  }
}

const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d

function markdown(results) {
  const out = []
  for (const r of results) {
    out.push(`### ${r.name}`, '')
    out.push(
      `${r.cycles} cycles, ${r.samples} samples, regression window ${r.window}; failed cycles ${r.failures}${r.failures ? ` (${r.failureKinds.join(', ')})` : ''}; page errors ${r.pageErrors ?? 'n/a'}.`,
      '',
    )
    out.push(
      '| metric (after GC) | cycle 0 | warm | last | max | slope KB/edit | 95% CI |',
      '|---|---:|---:|---:|---:|---:|---|',
    )
    for (const [k, m] of Object.entries(r.memory)) {
      if (m) {
        out.push(
          `| ${k} | ${m.first} | ${m.warm} | ${m.last} | ${m.max} | ${m.kbPerEdit} | [${m.ci95.join(', ')}] |`,
        )
      }
    }
    out.push(
      '',
      '| cache counter | cycle 0 | warm | last | max | per 100 cycles | 95% CI | grows |',
      '|---|---:|---:|---:|---:|---:|---|---|',
    )
    for (const [k, c] of Object.entries(r.caches)) {
      if (k.endsWith('.instances')) {
        continue
      }
      out.push(
        `| ${k} | ${c.first} | ${c.warm} | ${c.last} | ${c.max} | ${c.per100Cycles} | ${c.ci95 ? `[${c.ci95.join(', ')}]` : ''} | ${c.grows ? '**yes**' : ''} |`,
      )
    }
    out.push('')
  }
  return out.join('\n')
}

if (positionals.length) {
  const results = positionals.map((file) =>
    analyze(JSON.parse(fs.readFileSync(file, 'utf8'))),
  )
  const md = markdown(results)
  if (opts.md) {
    fs.mkdirSync(path.dirname(path.resolve(opts.md)), { recursive: true })
    fs.writeFileSync(opts.md, md)
  }
  if (opts.json) {
    fs.writeFileSync(opts.json, JSON.stringify(results, null, 2))
  }
  if (!opts.md) {
    console.log(md)
  }
}
