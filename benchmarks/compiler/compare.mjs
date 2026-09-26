import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Alternate whole-workload runs between checkouts; every sample still gets
// the fresh worker process provided by its existing workload harness.
const args = process.argv.slice(2)
function option(name, fallback) {
  const index = args.indexOf(name)
  return index < 0 ? fallback : args[index + 1]
}
const baseline = option('--baseline')
const candidate = option(
  '--candidate',
  fileURLToPath(new URL('../../', import.meta.url)),
)
const fixtures = option('--fixtures-root')
const output = option('--output')
const repetitions = Number(option('--repetitions', '5'))
const iterations = Number(option('--iterations', '10'))
assert.ok(baseline && fixtures && output)
assert.ok(Number.isSafeInteger(repetitions) && repetitions > 0)
assert.ok(Number.isSafeInteger(iterations) && iterations > 0)
const workloads = {
  splitter: {
    script: 'measure.mjs',
    parameters: (engine) => [
      '--fixtures-root',
      fixtures,
      '--iterations',
      String(iterations),
      '--warmups',
      '2',
      '--modes',
      engine === 'baseline' ? 'babel-splitter' : 'yuku-splitter',
    ],
  },
  routes: {
    script: 'route-heavy.mjs',
    parameters: () => ['--routes', '250'],
  },
  start: {
    script: 'build.mjs',
    parameters: () => ['--app', 'e2e/react-start/server-functions'],
  },
}
const result = {
  timestamp: new Date().toISOString(),
  node: process.version,
  repetitions,
  iterations,
  complete: false,
  order: [],
  workloads: Object.fromEntries(
    Object.keys(workloads).map((name) => [
      name,
      { baseline: [], candidate: [] },
    ]),
  ),
}
for (let repetition = 0; repetition < repetitions; repetition++) {
  const engines =
    repetition % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate']
  for (const [name, workload] of Object.entries(workloads)) {
    for (const engine of engines) {
      const started = new Date().toISOString()
      const execution = spawnSync(
        process.execPath,
        [
          fileURLToPath(new URL(workload.script, import.meta.url)),
          '--workspace',
          engine === 'baseline' ? baseline : candidate,
          '--repetitions',
          '1',
          ...workload.parameters(engine),
        ],
        { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
      )
      assert.equal(
        execution.status,
        0,
        `${execution.stdout}\n${execution.stderr}`,
      )
      result.workloads[name][engine].push(JSON.parse(execution.stdout))
      result.order.push({
        repetition,
        workload: name,
        engine,
        started,
        finished: new Date().toISOString(),
      })
      writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`)
      process.stderr.write(
        `${repetition + 1}/${repetitions} ${name} ${engine} completed\n`,
      )
    }
  }
}
result.complete = true
writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`)
