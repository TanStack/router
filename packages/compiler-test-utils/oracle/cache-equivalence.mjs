#!/usr/bin/env node
/**
 * The cache-equivalence run: a chosen set of the oracle's suites, once as
 * they are and once with every compiler cache off (`TSR_COMPILER_NO_CACHE=all`,
 * router-utils `src/compiler/stats.ts`), and the two runs' outcomes compared
 * test by test and file by file (a file fails on its own too: a hook, the
 * stats check at its end). The caches may change speed only, never an
 * outcome: any difference fails the run, and so does a test that fails in
 * both runs (no baseline), a run that did not start, ended on a signal or
 * exited nonzero for anything its report does not show, ran no test (all
 * skipped included), or has a filter no file of its report matches.
 * A known-bug pin (`.fails`) that passes with the caches off (its bug is a
 * cache's) is listed, and fails the run too unless `--pins` allows it.
 *
 * The set: the oracle's fast tiers (router-generator, router-plugin,
 * start-plugin-core `test:unit`) and the slow tier's freshness, watch and
 * cache suites (`SLOW`), chosen from a survey of every slow-tier file whose
 * name says dev, watch, cache, edit, restart, HMR or freshness (`--survey`
 * runs those instead).
 *
 * Usage, from the repository root (one build first, then the test commands
 * with `--excludeTaskDependencies`, as the whole oracle's):
 *
 *   node packages/compiler-test-utils/oracle/cache-equivalence.mjs [--out <dir>] [--skip-build] [--only <target>] [--survey] [--pins]
 *
 * Each run's Vitest JSON report and log are in `<dir>/<on|off>/` (`--out`
 * must be new or empty). Exit code 0: the runs agree.
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
    survey: { type: 'boolean', default: false },
    pins: { type: 'boolean', default: false },
  },
})

/**
 * The slow tier's freshness, watch and cache suites, per project (substring
 * filters, as Vitest reads them), chosen from the survey (`--survey`, both
 * modes over every surveyed file, 2026-11-25): every file that differed in
 * it or in the reviews' runs, and the files whose subject is an edit, a
 * removal, a watch rebuild, a restart or a cache restore. Not the
 * `perf-guards` files (in the survey neither): they are not the oracle but
 * guards of reported costs, counting what the compiler does; most count what
 * the caches save, which the knobs remove by design. `start-dev-cache-dir`
 * counts the plans held, which the plans knob keeps (it passed 3/3 in both
 * modes), and is left out with them: a count, not an output.
 */
const SLOW = {
  '@tanstack/start-plugin-core': [
    'tests/integration/start-dev-freshness',
    'tests/integration/start-dev-edits',
    'tests/integration/start-dev-removed-import',
    'tests/integration/start-dev-settlement',
    'tests/integration/start-dev-restart',
    'tests/integration/start-dev-resolution',
    'tests/integration/start-dev-route-shape-change',
    'tests/integration/start-dev-route-syntax-error',
    'tests/integration/start-dev-route-tree-footer',
    'tests/integration/start-build-watch',
    'tests/integration/start-build-settlement',
    'tests/integration/rsbuild/dev-file-back',
    'tests/integration/rsbuild/dev-dependents',
    'tests/integration/rsbuild/dev-checkout',
    'tests/integration/rsbuild/dev-removed-import',
    'tests/integration/rsbuild/dev-watched-directory',
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

/** The survey's files of a project: every slow-tier file whose name says dev, watch, cache, edit, restart, HMR or freshness. */
function surveyed(project) {
  const root = `packages/${project.split('/')[1]}`
  const files = []
  const walk = (at) => {
    for (const entry of fs.readdirSync(path.join(root, at), {
      withFileTypes: true,
    })) {
      const rel = `${at}/${entry.name}`
      if (entry.isDirectory()) {
        walk(rel)
      } else if (
        entry.name.endsWith('.test.ts') &&
        !rel.includes('/perf-guards/') &&
        /dev|watch|cache|edit|restart|hmr|fresh|settlement|checkout/i.test(
          entry.name,
        )
      ) {
        files.push(rel)
      }
    }
  }
  walk('tests/integration')
  return files.sort()
}

/** Each run: an Nx target and its Vitest filters. */
const RUNS = [
  ...(opts.survey
    ? []
    : [
        { target: '@tanstack/router-generator:test:unit', filters: [] },
        { target: '@tanstack/router-plugin:test:unit', filters: [] },
        { target: '@tanstack/start-plugin-core:test:unit', filters: [] },
      ]),
  ...Object.entries(SLOW).map(([project, filters]) => ({
    target: `${project}:test:integration:whole`,
    filters: opts.survey ? surveyed(project) : filters,
  })),
].filter((run) => !opts.only || run.target === opts.only)
if (RUNS.length === 0) {
  console.error(`cache-equivalence: no target selected (--only ${opts.only})`)
  process.exit(1)
}

const out = path.resolve(
  opts.out ?? path.join(os.tmpdir(), `cache-equivalence-${Date.now()}`),
)
if (fs.existsSync(out) && fs.readdirSync(out).length > 0) {
  // (reports of an earlier run would read as this one's)
  console.error(
    `cache-equivalence: ${out} is not empty; give a new or empty directory`,
  )
  process.exit(1)
}
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
    console.error(
      `cache-equivalence: the build failed (${built.error?.message ?? built.signal ?? built.status})`,
    )
    process.exit(1)
  }
}

/** A repository-relative path with `/` separators (one key on every platform). */
const relative = (file) =>
  path.relative(process.cwd(), file).split(path.sep).join('/')

/**
 * Runs one target in one mode: the outcome of each test and file (by file
 * and name), and the run's own failures: it did not start, ended on a
 * signal, reported nothing, or exited nonzero with no failed test or file to
 * show for it.
 */
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
      env: { ...env, TSR_COMPILER_NO_CACHE: mode === 'off' ? 'all' : '' },
      encoding: 'utf8',
      maxBuffer: 1 << 30,
    },
  )
  fs.writeFileSync(log, `${result.stdout ?? ''}${result.stderr ?? ''}`)
  const how = result.error
    ? `not started (${result.error.message})`
    : result.signal
      ? `ended on ${result.signal}`
      : `exit ${result.status}`
  console.log(`  ${target} caches ${mode}: ${how} (${log})`)
  const outcomes = new Map()
  const problems = []
  if (result.error || result.signal) {
    problems.push(`${target} caches ${mode}: ${how}`)
  }
  if (!fs.existsSync(report)) {
    problems.push(`${target} caches ${mode}: no report`)
    return { outcomes, problems }
  }
  const parsed = JSON.parse(fs.readFileSync(report, 'utf8'))
  // (skipped and todo tests ran nothing)
  if (parsed.numPassedTests + parsed.numFailedTests === 0) {
    problems.push(`${target} caches ${mode}: no test ran`)
  }
  for (const filter of filters) {
    if (
      !parsed.testResults.some((file) => relative(file.name).includes(filter))
    ) {
      problems.push(`${target} caches ${mode}: no file matches ${filter}`)
    }
  }
  let failures = 0
  for (const file of parsed.testResults) {
    const rel = relative(file.name)
    const tests = file.assertionResults.map((test) => ({
      key: `${rel} > ${test.fullName}`,
      status: test.status,
      // a pin whose bug is gone fails with Vitest's "Expect test to fail"
      pin: test.failureMessages.some((m) => m.includes('Expect test to fail')),
    }))
    const failed = tests.filter((test) => test.status === 'failed')
    failures += failed.length + (file.status === 'failed' ? 1 : 0)
    outcomes.set(`${rel} (file)`, {
      status: file.status,
      // (a file failed by its pins alone is theirs)
      pin:
        failed.length > 0 && failed.every((test) => test.pin) && !file.message,
    })
    for (const { key, status, pin } of tests) {
      outcomes.set(key, { status, pin })
    }
  }
  if (result.status !== 0 && failures === 0) {
    problems.push(
      `${target} caches ${mode}: exit ${result.status} with no failed test or file`,
    )
  }
  return { outcomes, problems }
}

const differ = []
const pins = []
/** Tests that failed in both runs: the runs agree, but on no green baseline. */
const failing = []
const problems = []
for (const r of RUNS) {
  const on = run(r, 'on')
  const off = run(r, 'off')
  problems.push(...on.problems, ...off.problems)
  for (const key of new Set([...on.outcomes.keys(), ...off.outcomes.keys()])) {
    const a = on.outcomes.get(key)?.status ?? 'absent'
    const b = off.outcomes.get(key)?.status ?? 'absent'
    if (a === b) {
      if (a === 'failed') {
        failing.push(`  ${key}`)
      }
      continue
    }
    ;(off.outcomes.get(key)?.pin ? pins : differ).push(`  ${key}: ${a} → ${b}`)
  }
}
const list = (title, lines) => {
  if (lines.length > 0) {
    console.log(`\n${title}:\n${lines.join('\n')}`)
  }
}
list(
  'Runs that did not report',
  problems.map((p) => `  ${p}`),
)
list("Pins that pass with every cache off (their bug is a cache's)", pins)
list('Outcomes that differ with every cache off (on → off)', differ)
list('Tests that fail in both runs (no baseline to compare)', failing)
const failed =
  problems.length > 0 ||
  differ.length > 0 ||
  failing.length > 0 ||
  (pins.length > 0 && !opts.pins)
console.log(
  `\ncache-equivalence: ${failed ? 'the runs differ' : 'the runs agree'}`,
)
process.exit(failed ? 1 : 0)
