#!/usr/bin/env node
// Compares two harness result files.
// Usage: node scripts/compare.mjs <baseline results.json> <candidate results.json> [--md out.md]

import fs from 'node:fs'
import { parseArgs } from 'node:util'
import { primaryMetrics } from './report.mjs'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { md: { type: 'string' } },
})
if (positionals.length !== 2) {
  console.error(
    'Usage: node scripts/compare.mjs <baseline results.json> <candidate results.json> [--md out.md]',
  )
  process.exit(1)
}
const [base, cand] = positionals.map((f) =>
  JSON.parse(fs.readFileSync(f, 'utf8')),
)

const lines = []
lines.push(`# Compiler perf: ${cand.label} vs ${base.label}`)
lines.push('')
lines.push(
  `- baseline: \`${base.meta.commit?.slice(0, 10)}\` (${base.meta.branch}), node ${base.meta.node}`,
)
lines.push(
  `- candidate: \`${cand.meta.commit?.slice(0, 10)}\` (${cand.meta.branch}), node ${cand.meta.node}`,
)

const warnings = []
for (const [variant, w] of Object.entries(cand.workloads)) {
  const b = base.workloads[variant]
  if (b && b.hash !== w.hash) {
    warnings.push(
      `workload ${variant} differs (hash ${b.hash} vs ${w.hash}): inputs are not identical`,
    )
  }
}
if (base.meta.node !== cand.meta.node) {
  warnings.push(
    `different Node versions (${base.meta.node} vs ${cand.meta.node})`,
  )
}
for (const [name, v] of Object.entries(cand.meta.versions ?? {})) {
  if (base.meta.versions?.[name] !== v) {
    warnings.push(`different ${name} (${base.meta.versions?.[name]} vs ${v})`)
  }
}
if (base.meta.cpu !== cand.meta.cpu) {
  warnings.push(`different machines (${base.meta.cpu} vs ${cand.meta.cpu})`)
}
for (const [name, entry] of Object.entries(cand.scenarios)) {
  const flagged =
    (entry.flaggedRuns ?? 0) + (base.scenarios[name]?.flaggedRuns ?? 0)
  if (flagged) {
    warnings.push(`${name}: ${flagged} runs flagged for machine load`)
  }
}
for (const w of warnings) {
  lines.push(`- **warning:** ${w}`)
}
lines.push('')
lines.push(
  'Verdict: `faster`/`slower` when the sample ranges do not overlap, `~faster`/`~slower` when the medians differ by more than twice the larger cv, `~` otherwise.',
)
lines.push('')
lines.push(
  '| scenario | metric | base median | cand median | Δ | Δ% | base p90 | cand p90 | verdict |',
)
lines.push('|---|---|---:|---:|---:|---:|---:|---:|---|')

const r = (v) => (v >= 100 ? Math.round(v) : Math.round(v * 10) / 10)
for (const [name, entry] of Object.entries(cand.scenarios)) {
  const baseEntry = base.scenarios[name]
  if (!baseEntry) {
    continue
  }
  for (const key of primaryMetrics(name, entry.metrics)) {
    const c = entry.metrics[key]
    const b = baseEntry.metrics[key]
    if (!b?.n || !c?.n) {
      continue
    }
    const delta = c.median - b.median
    const pct = b.median ? (delta / b.median) * 100 : 0
    let verdict = '~'
    if (c.max < b.min) {
      verdict = 'faster'
    } else if (c.min > b.max) {
      verdict = 'slower'
    } else if (Math.abs(pct) > 200 * Math.max(b.cv, c.cv)) {
      verdict = pct < 0 ? '~faster' : '~slower'
    }
    lines.push(
      `| ${name} | ${key} | ${r(b.median)} | ${r(c.median)} | ${delta > 0 ? '+' : ''}${r(delta)} | ${pct > 0 ? '+' : ''}${pct.toFixed(1)}% | ${r(b.p90)} | ${r(c.p90)} | ${verdict} |`,
    )
  }
}

const attrNames = Object.keys(cand.attribution ?? {}).filter(
  (n) => base.attribution?.[n]?.cpu?.main,
)
if (attrNames.length) {
  lines.push('')
  lines.push('## Compiler attribution (profiled runs)')
  lines.push('')
  lines.push(
    '| run | base compiler ms | cand compiler ms | base share | cand share | base busy ms | cand busy ms |',
  )
  lines.push('|---|---:|---:|---:|---:|---:|---:|')
  for (const name of attrNames) {
    const b = base.attribution[name].cpu.main
    const c = cand.attribution[name].cpu.main
    if (!c) {
      continue
    }
    lines.push(
      `| ${name} | ${r(b.compilerInclusiveMs)} | ${r(c.compilerInclusiveMs)} | ${(b.compilerShareOfBusy * 100).toFixed(1)}% | ${(c.compilerShareOfBusy * 100).toFixed(1)}% | ${r(b.busyMs)} | ${r(c.busyMs)} |`,
    )
  }
}

const out = lines.join('\n') + '\n'
if (values.md) {
  fs.writeFileSync(values.md, out)
}
console.log(out)
