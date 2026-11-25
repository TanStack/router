#!/usr/bin/env node
/**
 * The cache-equivalence run: a chosen set of the oracle's suites, once as
 * they are and once with every compiler cache off (`TSR_COMPILER_NO_CACHE=all`,
 * router-utils `src/compiler/stats.ts`), and the two runs' outcomes compared
 * test by test. The caches may change speed only, never an outcome: a test
 * whose outcome differs is a cache that answers what a fresh compile does not
 * (a missing invalidation, a stale reuse), and fails the run.
 *
 * The set: the oracle's fast tiers (router-generator, router-plugin,
 * start-plugin-core `test:unit`) and the slow tier's freshness and watch
 * suites (`SLOW`: edits, removals, overlapping requests, watch builds, dev
 * restarts). A known-bug pin (`.fails`) that passes with the caches off (its
 * bug is a cache's) is listed, and fails the run too unless `--pins` allows
 * it.
 *
 * Usage, from the repository root (one build first, then the test commands
 * with `--excludeTaskDependencies`, as the whole oracle's):
 *
 *   node packages/compiler-test-utils/oracle/cache-equivalence.mjs [--out <dir>] [--skip-build] [--only <target>]
 *
 * Each run's Vitest JSON report and log are in `<dir>/<on|off>/`. Exit code
 * 0: the runs agree.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'

const { values: opts } = parseArgs({
  options: {
    out: { type: 'string' },
    'skip-build': { type: 'boolean', default: false },
    only: { type: 'string' },
    pins: { type: 'boolean', default: false },
  },
})

/** The slow tier's freshness and watch suites, per project (substring filters, as Vitest reads them). */
const SLOW = {
  '@tanstack/start-plugin-core': [
    'tests/integration/start-dev-freshness',
    'tests/integration/start-dev-edits',
    'tests/integration/start-dev-removed-import',
    'tests/integration/start-dev-settlement',
    'tests/integration/start-dev-restart',
    'tests/integration/start-build-watch',
    'tests/integration/start-build-settlement',
    'tests/integration/rsbuild/dev-file-back',
    'tests/integration/rsbuild/dev-dependents',
    'tests/integration/rsbuild/dev-checkout',
    'tests/integration/rsbuild/watch-',
    'tests/integration/rsbuild/cache-restore-builds-nothing',
    'tests/integration/rsbuild/held-modules',
  ],
  '@tanstack/router-plugin': [
    'tests/integration/generator-watch-mode',
    'tests/integration/rsbuild-dev-server-generator-watching',
    'tests/integration/webpack-dev-server-generator-watching',
  ],
}

/** Each run: an Nx target and its Vitest filters. */
const RUNS = [
  { target: '@tanstack/router-generator:test:unit', filters: [] },
  { target: '@tanstack/router-plugin:test:unit', filters: [] },
  { target: '@tanstack/start-plugin-core:test:unit', filters: [] },
  ...Object.entries(SLOW).map(([project, filters]) => ({
    target: `${project}:test:integration:whole`,
    filters,
  })),
].filter((run) => !opts.only || run.target === opts.only)

const out = path.resolve(
  opts.out ?? fs.mkdtempSync(path.join(os.tmpdir(), 'cache-equivalence-')),
)
console.log(`cache-equivalence: reports in ${out}`)
const env = { ...process.env, CI: '1', NX_DAEMON: 'false' }

if (!opts['skip-build']) {
  const projects = [
    '@tanstack/router-generator',
    '@tanstack/router-plugin',
    '@tanstack/start-plugin-core',
    '@tanstack/react-start',
    '@tanstack/solid-start',
    '@tanstack/vue-start',
  ]
  const built = spawnSync(
    'pnpm',
    ['nx', 'run-many', '-t', 'build', '--skipRemoteCache', '-p', ...projects],
    { stdio: 'inherit', env },
  )
  if (built.status !== 0) {
    process.exit(built.status ?? 1)
  }
}

/** Runs one target in one mode; the outcome of each test, by file and name. */
function run({ target, filters }, mode) {
  const dir = path.join(out, mode)
  fs.mkdirSync(dir, { recursive: true })
  const name = target.replace(/[/:@]/g, '_')
  const report = path.join(dir, `${name}.json`)
  const log = path.join(dir, `${name}.log`)
  const result = spawnSync(
    'pnpm',
    [
      'nx',
      'run',
      target,
      '--excludeTaskDependencies',
      '--skipRemoteCache',
      // (Nx's cache does not know the switch)
      '--skip-nx-cache',
      '--outputStyle=stream',
      '--',
      '--reporter=default',
      '--reporter=json',
      `--outputFile.json=${report}`,
      ...filters,
    ],
    {
      env: {
        ...env,
        TSR_COMPILER_NO_CACHE: mode === 'off' ? 'all' : '',
      },
      encoding: 'utf8',
      maxBuffer: 1 << 30,
    },
  )
  fs.writeFileSync(log, `${result.stdout ?? ''}${result.stderr ?? ''}`)
  console.log(`  ${target} caches ${mode}: exit ${result.status} (${log})`)
  const outcomes = new Map()
  if (!fs.existsSync(report)) {
    outcomes.set(`${target} (no report)`, { status: 'missing', pin: false })
    return outcomes
  }
  for (const file of JSON.parse(fs.readFileSync(report, 'utf8')).testResults) {
    const rel = path.relative(process.cwd(), file.name)
    if (file.assertionResults.length === 0) {
      outcomes.set(`${rel} (file)`, { status: file.status, pin: false })
    }
    for (const test of file.assertionResults) {
      outcomes.set(`${rel} > ${test.fullName}`, {
        status: test.status,
        // a pin whose bug is gone fails with Vitest's "Expect test to fail"
        pin: test.failureMessages.some((m) =>
          m.includes('Expect test to fail'),
        ),
      })
    }
  }
  return outcomes
}

const differ = []
const pins = []
for (const r of RUNS) {
  const on = run(r, 'on')
  const off = run(r, 'off')
  for (const key of new Set([...on.keys(), ...off.keys()])) {
    const a = on.get(key)?.status ?? 'absent'
    const b = off.get(key)?.status ?? 'absent'
    if (a === b) {
      continue
    }
    ;(off.get(key)?.pin ? pins : differ).push(`  ${key}: ${a} → ${b}`)
  }
}
if (pins.length > 0) {
  console.log(
    `\nPins that pass with every cache off (their bug is a cache's):\n${pins.join('\n')}`,
  )
}
if (differ.length > 0) {
  console.log(
    `\nOutcomes that differ with every cache off (on → off):\n${differ.join('\n')}`,
  )
}
const failed = differ.length > 0 || (pins.length > 0 && !opts.pins)
console.log(
  `\ncache-equivalence: ${failed ? 'the runs differ' : 'the runs agree'}`,
)
process.exit(failed ? 1 : 0)
