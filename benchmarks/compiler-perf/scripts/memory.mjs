// Memory snapshots for the harness's build and dev processes.
//
// - `memorySnapshot()`: forces a full GC (needs --expose-gc) and returns the
//   V8 heap, external memory and RSS of this process, its peak RSS so far,
//   and the RSS of its descendant processes.
// - Preloaded with `node --import <this file>` and COMPILER_PERF_MEM_OUT set,
//   writes a snapshot to that file when the process exits (CLI builds).

import fs from 'node:fs'
import v8 from 'node:v8'

const MB = 2 ** 20

function procStatusKb(pid, field) {
  try {
    const match = fs
      .readFileSync(`/proc/${pid}/status`, 'utf8')
      .match(new RegExp(`^${field}:\\s+(\\d+) kB`, 'm'))
    return match ? Number(match[1]) : undefined
  } catch {
    return undefined
  }
}

/** pid -> parent pid for every process (Linux). */
function processTree() {
  const parents = new Map()
  try {
    for (const entry of fs.readdirSync('/proc')) {
      if (!/^\d+$/.test(entry)) {
        continue
      }
      try {
        const stat = fs.readFileSync(`/proc/${entry}/stat`, 'utf8')
        parents.set(
          Number(entry),
          Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]),
        )
      } catch {}
    }
  } catch {}
  return parents
}

export function descendants(rootPid, parents = processTree()) {
  const out = []
  for (const pid of parents.keys()) {
    for (let p = parents.get(pid); p > 1; p = parents.get(p) ?? 0) {
      if (p === rootPid) {
        out.push(pid)
        break
      }
    }
  }
  return out
}

/** Current RSS (MB) of a process tree's descendants, excluding the root. */
export function descendantsRssMb(rootPid) {
  let kb = 0
  for (const pid of descendants(rootPid)) {
    kb += procStatusKb(pid, 'VmRSS') ?? 0
  }
  return kb / 1024
}

export function memorySnapshot() {
  const gc = globalThis.gc
  if (gc) {
    // Two passes: the first can leave objects pending finalization.
    gc()
    gc()
  }
  const usage = process.memoryUsage()
  const heap = v8.getHeapStatistics()
  const peakKb = procStatusKb('self', 'VmHWM') ?? process.resourceUsage().maxRSS
  const r = (v) => Math.round(v * 10) / 10
  return {
    gc: Boolean(gc),
    heapUsedMb: r(heap.used_heap_size / MB),
    heapTotalMb: r(heap.total_heap_size / MB),
    externalMb: r(usage.external / MB),
    arrayBuffersMb: r(usage.arrayBuffers / MB),
    rssMb: r(usage.rss / MB),
    peakRssMb: r(peakKb / 1024),
    childrenRssMb: r(descendantsRssMb(process.pid)),
  }
}

if (
  process.env.COMPILER_PERF_MEM_OUT &&
  !globalThis.__compilerPerfMemInstalled
) {
  globalThis.__compilerPerfMemInstalled = true
  const out = process.env.COMPILER_PERF_MEM_OUT
  // Do not pass the variable on to processes this one spawns.
  delete process.env.COMPILER_PERF_MEM_OUT
  process.on('exit', () => {
    fs.writeFileSync(out, JSON.stringify(memorySnapshot()))
  })
}
