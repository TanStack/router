import fs from 'node:fs'

export function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b)
  const n = sorted.length
  if (!n) {
    return { n: 0 }
  }
  const q = (p) => sorted[Math.min(n - 1, Math.max(0, Math.ceil(p * n) - 1))]
  const mean = sorted.reduce((a, b) => a + b, 0) / n
  const sd = Math.sqrt(
    sorted.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1),
  )
  const median =
    n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2
  const r = (v) => Math.round(v * 10) / 10
  return {
    n,
    median: r(median),
    p90: r(q(0.9)),
    min: r(sorted[0]),
    max: r(sorted[n - 1]),
    mean: r(mean),
    stdev: r(sd),
    cv: mean ? Math.round((sd / mean) * 1000) / 1000 : 0,
    samples,
  }
}

export function summarize(results) {
  const scenarios = {}
  for (const [name, entry] of Object.entries(results.scenarios)) {
    scenarios[name] = {
      metrics: Object.fromEntries(
        Object.entries(entry.metrics).map(([k, v]) => [k, stats(v)]),
      ),
      runs: entry.runs,
      flaggedRuns: entry.runs.filter((r) => r.flagged).length,
      maxOthersBusyDuring: Math.max(
        0,
        ...entry.runs.map((r) => r.othersBusyDuring ?? 0),
      ),
    }
  }
  return { ...results, scenarios }
}

const fmt = (v) =>
  v === undefined
    ? 'n/a'
    : v >= 100
      ? Math.round(v).toLocaleString('en-US')
      : String(v)

// The metric each scenario is primarily judged by.
export const PRIMARY = {
  build: ['buildMs'],
  'dev-compile': ['compileAllMs', 'clientMs', 'ssrMs', 'listenMs'],
  'dev-cold': ['hydratedMs', 'listenMs'],
  'dev-warm': ['hydratedMs', 'listenMs'],
  'rsbuild-build': ['buildMs'],
  'rsbuild-dev-cold': ['hydratedMs', 'listenMs'],
  hmr: ['updateMs'],
}

export function primaryMetrics(name, metrics) {
  const kind = name.split('/')[1]
  const keys = PRIMARY[kind] ?? Object.keys(metrics)
  return keys.filter((k) => metrics[k])
}

export function writeMarkdown(summary, file) {
  const lines = []
  const m = summary.meta
  lines.push(`# Compiler perf: ${summary.label}`)
  lines.push('')
  lines.push(
    `- commit \`${m.commit}\` (${m.branch}${m.dirty ? ', dirty packages/' : ''})`,
  )
  lines.push(`- node ${m.node}, ${m.cpu}, ${m.memGb} GiB, ${m.platform}`)
  lines.push(
    `- versions: ${Object.entries(m.versions ?? {})
      .map(([k, v]) => `${k}@${v}`)
      .join(', ')}`,
  )
  lines.push(
    `- runs ${m.options?.runs} (+${m.options?.warmup} warmup), HMR ${m.options?.hmrIterations} edits (+${m.options?.hmrWarmup} warmup); started ${m.startedAt}${m.finishedAt ? `, finished ${m.finishedAt}` : ' (incomplete)'}`,
  )
  for (const [variant, w] of Object.entries(summary.workloads)) {
    lines.push(
      `- workload ${variant}: ${w.files} files, ${w.routeFiles} route files, ${w.serverFns} server fns, hash \`${w.hash}\``,
    )
  }
  lines.push('')
  lines.push(
    '| scenario | metric | median ms | p90 | min | max | cv | n | flagged | max others busy (cores) |',
  )
  lines.push('|---|---|---:|---:|---:|---:|---:|---:|---:|---:|')
  for (const [name, entry] of Object.entries(summary.scenarios)) {
    for (const key of primaryMetrics(name, entry.metrics)) {
      const s = entry.metrics[key]
      lines.push(
        `| ${name} | ${key} | ${fmt(s.median)} | ${fmt(s.p90)} | ${fmt(s.min)} | ${fmt(s.max)} | ${(s.cv * 100).toFixed(1)}% | ${s.n} | ${entry.flaggedRuns || ''} | ${entry.maxOthersBusyDuring ?? ''} |`,
      )
    }
    const reloads = entry.metrics.fullReloads ?? entry.metrics.reloads
    if (reloads && reloads.max > 0) {
      lines.push(
        `| ${name} | ${entry.metrics.fullReloads ? 'fullReloads' : 'reloads'} (count) | ${reloads.median} | | ${reloads.min} | ${reloads.max} | | ${reloads.n} | |`,
      )
    }
  }
  if (Object.keys(summary.attribution ?? {}).length) {
    lines.push('')
    lines.push(
      '## Compiler attribution (single profiled run each; profiling inflates times)',
    )
    lines.push('')
    lines.push(
      '| run | wall ms | main-thread busy ms | compiler inclusive ms | share of busy | babel self | tanstack self | vite self | gc |',
    )
    lines.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|')
    for (const [name, a] of Object.entries(summary.attribution)) {
      const cpu = a.cpu.main
      if (!cpu) {
        continue
      }
      const c = cpu.byCategory
      lines.push(
        `| ${name} | ${fmt(a.wallMs)} | ${fmt(cpu.busyMs)} | ${fmt(cpu.compilerInclusiveMs)} | ${(cpu.compilerShareOfBusy * 100).toFixed(1)}% | ${fmt(c.babel ?? 0)} | ${fmt(c['tanstack-compiler'] ?? 0)} | ${fmt(c.vite ?? 0)} | ${fmt(c['(gc)'] ?? 0)} |`,
      )
    }
    for (const [name, a] of Object.entries(summary.attribution)) {
      const ours = a.hooks
        .filter((h) => /tanstack|router|start/i.test(h.plugin))
        .slice(0, 12)
      if (!ours.length) {
        continue
      }
      lines.push('')
      lines.push(
        `### ${name}: TanStack plugin hooks (sync ms = main-thread time until the hook returned)`,
      )
      lines.push('')
      lines.push('| plugin | hook | calls | sync ms |')
      lines.push('|---|---|---:|---:|')
      for (const h of ours) {
        lines.push(
          `| ${h.plugin} | ${h.hook} | ${h.calls} | ${fmt(Math.round(h.syncMs))} |`,
        )
      }
      const allSync = a.hooks.reduce((sum, h) => sum + h.syncMs, 0)
      const oursSync = a.hooks
        .filter((h) => /tanstack/i.test(h.plugin))
        .reduce((sum, h) => sum + h.syncMs, 0)
      lines.push(
        `| **all tanstack** | | | ${fmt(Math.round(oursSync))} of ${fmt(Math.round(allSync))} wrapped-hook ms |`,
      )
    }
  }
  fs.writeFileSync(file, lines.join('\n') + '\n')
}
