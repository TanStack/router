// IPC handlers of a measured dev server process (the Vite dev driver, or the
// Rsbuild CLI preloaded with `node --import ipc-agent.mjs` and
// COMPILER_PERF_IPC_AGENT=1):
//   <- { type: 'mem' }                     -> { type: 'mem', result }
//   <- { type: 'stats' }                   -> { type: 'stats', result }
//   <- { type: 'heap-snapshot', file }     -> { type: 'heap-snapshot', file, ms }
//
// `stats` reads the compiler's cache sizes from the process-global registry
// the TanStack packages fill when TSR_COMPILER_STATS=1 (see
// `compilerStats()` in @tanstack/router-utils/compiler); a checkout without
// it reports `{}`.

import { performance } from 'node:perf_hooks'
import v8 from 'node:v8'
import { memorySnapshot } from './memory.mjs'

const REGISTRY = Symbol.for('tanstack.compiler.stats')

/** Cache sizes per label (summed over live instances). */
export function compilerStatsSnapshot() {
  const out = {}
  for (const s of globalThis[REGISTRY] ?? []) {
    const owner = s.owner.deref()
    if (!owner) {
      continue
    }
    const sum = (out[s.label] ??= { instances: 0 })
    sum.instances++
    for (const [k, v] of Object.entries(s.read(owner))) {
      sum[k] = (sum[k] ?? 0) + v
    }
  }
  return out
}

/** Full GCs with event-loop turns in between (finalizers release native memory). */
export async function settleGc() {
  for (let i = 0; i < 3; i++) {
    globalThis.gc?.()
    await new Promise((r) => setImmediate(r))
    await new Promise((r) => setTimeout(r, 5))
  }
}

export function installIpcAgent() {
  if (globalThis.__compilerPerfIpcAgent || !process.send) {
    return
  }
  globalThis.__compilerPerfIpcAgent = true
  process.on('message', async (msg) => {
    if (msg?.type === 'mem') {
      await settleGc()
      process.send({ type: 'mem', result: memorySnapshot() })
    } else if (msg?.type === 'stats') {
      const t0 = performance.now()
      const result = compilerStatsSnapshot()
      process.send({
        type: 'stats',
        result,
        ms: performance.now() - t0,
      })
    } else if (msg?.type === 'heap-snapshot') {
      await settleGc()
      const t0 = performance.now()
      const file = v8.writeHeapSnapshot(msg.file)
      process.send({
        type: 'heap-snapshot',
        file,
        ms: performance.now() - t0,
      })
    }
  })
}

if (process.env.COMPILER_PERF_IPC_AGENT === '1') {
  installIpcAgent()
}
