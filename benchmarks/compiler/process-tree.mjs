import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { compilerFingerprint } from './provenance.mjs'

// Separate diagnostic run: ps sampling deliberately stays outside speed runs.
const args = process.argv.slice(2)
const script = args.shift()
const workspaceArgument = args.indexOf('--workspace')
const workspace =
  workspaceArgument < 0
    ? fileURLToPath(new URL('../../', import.meta.url))
    : args[workspaceArgument + 1]
assert.ok(
  script,
  'Usage: node process-tree.mjs <build.mjs|route-heavy.mjs> [args]',
)
const child = spawn(
  process.execPath,
  [
    '--expose-gc',
    fileURLToPath(new URL(script, import.meta.url)),
    '--worker',
    ...args,
  ],
  {
    env: { ...process.env, NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
)
let stdout = ''
let stderr = ''
child.stdout.on('data', (data) => {
  stdout += data
})
child.stderr.on('data', (data) => {
  stderr += data
})
let peakTreeKiB = 0
let peakRootKiB = 0
let samples = 0
const descendants = new Map()
function sample() {
  const result = spawnSync('ps', ['-Ao', 'pid=,ppid=,rss=,comm='], {
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  const processes = result.stdout
    .trim()
    .split('\n')
    .map((line) => {
      const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/)
      return (
        match && {
          pid: Number(match[1]),
          parent: Number(match[2]),
          rss: Number(match[3]),
          command: match[4],
        }
      )
    })
    .filter(Boolean)
  const included = new Set([child.pid])
  let previousSize
  do {
    previousSize = included.size
    for (const process of processes) {
      if (included.has(process.parent)) {
        included.add(process.pid)
      }
    }
  } while (included.size !== previousSize)
  let rss = 0
  for (const process of processes) {
    if (!included.has(process.pid)) {
      continue
    }
    rss += process.rss
    if (process.pid === child.pid) {
      peakRootKiB = Math.max(peakRootKiB, process.rss)
    } else {
      descendants.set(process.pid, {
        ...process,
        peakRssKiB: Math.max(
          descendants.get(process.pid)?.peakRssKiB ?? 0,
          process.rss,
        ),
      })
    }
  }
  peakTreeKiB = Math.max(peakTreeKiB, rss)
  samples++
}
sample()
const timer = setInterval(sample, 50)
const status = await new Promise((resolve, reject) => {
  child.once('error', reject)
  child.once('close', resolve)
})
clearInterval(timer)
assert.equal(status, 0, `${stdout}\n${stderr}`)
const line = stdout
  .split('\n')
  .find((entry) => entry.startsWith('BENCHMARK_JSON='))
assert.ok(line, stdout)
console.log(
  JSON.stringify(
    {
      timestamp: new Date().toISOString(),
      node: process.version,
      compilerFingerprint: compilerFingerprint(workspace),
      diagnosticOnly: true,
      sampleIntervalMs: 50,
      samples,
      peakTreeMiB: peakTreeKiB / 1024,
      peakRootMiB: peakRootKiB / 1024,
      descendants: [...descendants.values()],
      worker: JSON.parse(line.slice(15)),
    },
    null,
    2,
  ),
)
