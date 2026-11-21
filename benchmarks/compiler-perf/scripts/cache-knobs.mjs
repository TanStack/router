#!/usr/bin/env node
// Cache on/off comparison: runs the harness once per (round, knob) with
// TSR_COMPILER_NO_CACHE=<knob> ('' = every cache on), interleaved so every
// configuration sees the same machine conditions, then reports the median of
// each metric per knob and its change against "on".
//
// Usage: node cache-knobs.mjs --out <dir> [--rounds 3] [--knobs on,plans,facts,targets]
//        [--variants react-start,react-router] [--scenarios build,dev-compile,dev-cold,hmr]
//        [--runs 2] [--hmr-iterations 6] [--max-busy 8] [--port 4810] [--report-only]

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const { values: opts } = parseArgs({
  options: {
    out: { type: 'string' },
    rounds: { type: 'string', default: '3' },
    knobs: { type: 'string', default: 'on,plans,facts,targets' },
    variants: { type: 'string', default: 'react-start,react-router' },
    scenarios: { type: 'string', default: 'build,dev-compile,dev-cold,hmr' },
    runs: { type: 'string', default: '2' },
    'hmr-iterations': { type: 'string', default: '6' },
    'max-busy': { type: 'string', default: '8' },
    port: { type: 'string', default: '4810' },
    'report-only': { type: 'boolean', default: false },
  },
})
const out = path.resolve(opts.out)
const knobs = opts.knobs.split(',')
const rounds = Number(opts.rounds)

if (!opts['report-only']) {
  for (let round = 1; round <= rounds; round++) {
    for (const knob of knobs) {
      const dir = path.join(out, `${knob}-r${round}`)
      if (fs.existsSync(path.join(dir, 'results.json'))) {
        continue
      }
      console.log(`round ${round} knob ${knob}`)
      // a run that dies (a crashed browser) is retried once from scratch
      for (let attempt = 1; ; attempt++) {
        try {
          runOnce(knob, round, dir)
          break
        } catch (error) {
          console.log(
            `round ${round} knob ${knob} failed (attempt ${attempt}): ${error.message.split('\n')[0]}`,
          )
          if (attempt === 2) {
            break
          }
          fs.rmSync(dir, { recursive: true, force: true })
        }
      }
    }
  }
}

function runOnce(knob, round, dir) {
  execFileSync(
    process.execPath,
    [
      path.join(here, 'run.mjs'),
      '--label',
      `cache-${knob}-r${round}`,
      '--out',
      dir,
      '--variants',
      opts.variants,
      '--scenarios',
      opts.scenarios,
      '--runs',
      opts.runs,
      '--warmup',
      round === 1 ? '1' : '0',
      '--hmr-iterations',
      opts['hmr-iterations'],
      '--hmr-warmup',
      '2',
      '--max-busy',
      opts['max-busy'],
      '--skip-package-builds',
      '--port',
      opts.port,
    ],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        TSR_COMPILER_NO_CACHE: knob === 'on' ? '' : knob,
      },
    },
  )
}

// ---------------------------------------------------------------------------

const METRICS = {
  build: ['buildMs'],
  'dev-compile': ['compileAllMs', 'listenMs'],
  'dev-cold': ['hydratedMs'],
  'rsbuild-build': ['buildMs'],
  'rsbuild-dev-cold': ['hydratedMs'],
}
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  const n = s.length
  return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN
}
const samples = {}
let load = []
for (const knob of knobs) {
  for (let round = 1; round <= rounds; round++) {
    const file = path.join(out, `${knob}-r${round}`, 'results.json')
    if (!fs.existsSync(file)) {
      continue
    }
    const res = JSON.parse(fs.readFileSync(file, 'utf8'))
    for (const [name, entry] of Object.entries(res.scenarios)) {
      const [, scenario, kind] = name.split('/')
      const keys = scenario === 'hmr' ? ['updateMs'] : (METRICS[scenario] ?? [])
      for (const key of keys) {
        const values = entry.metrics[key]?.samples ?? []
        const id = `${name}:${key}`
        ;((samples[id] ??= {})[knob] ??= []).push(...values)
      }
      for (const run of entry.runs) {
        if (typeof run.othersBusyDuring === 'number') {
          load.push(run.othersBusyDuring)
        }
      }
      void kind
    }
  }
}
const lines = [
  `| metric | ${knobs.map((k) => (k === 'on' ? 'all on' : `${k} off`)).join(' | ')} |`,
  `|---|${knobs.map(() => '---:').join('|')}|`,
]
for (const [id, byKnob] of Object.entries(samples).sort()) {
  const base = median(byKnob.on ?? [])
  lines.push(
    `| ${id} | ${knobs
      .map((k) => {
        const m = median(byKnob[k] ?? [])
        if (!Number.isFinite(m)) {
          return 'n/a'
        }
        const d =
          k === 'on' || !base
            ? ''
            : ` (${m >= base ? '+' : ''}${(((m - base) / base) * 100).toFixed(1)}%)`
        return `${Math.round(m)}${d} n=${byKnob[k].length}`
      })
      .join(' | ')} |`,
  )
}
load = load.sort((a, b) => a - b)
lines.push(
  '',
  `Other processes' load during the runs: median ${median(load).toFixed(1)} cores, max ${load.at(-1)?.toFixed(1)}.`,
)
fs.writeFileSync(path.join(out, 'cache-knobs.md'), lines.join('\n') + '\n')
console.log(lines.join('\n'))
