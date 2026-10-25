/**
 * Gate (l): retained heap over the package-source corpus. Compiles every
 * `packages/*\/src/**\/*.ts{,x}` file with the toy planners, keeps only the
 * caches, forces GC and asserts the heap and ArrayBuffer deltas stay within
 * the plain-data envelope (no Yuku SourceFile/buffer retained, R19).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { describe, expect, it } from 'vitest'
import { parse } from 'yuku'
import { identify } from '../src/compiler'
import {
  MemoryHost,
  toyEdgePolicyPlanner,
  toyEnvPlanner,
  toySplitPlanner,
} from './helpers'

const ROOT = path.resolve(__dirname, '../../..')

function corpus(): Array<string> {
  const out: Array<string> = []
  const pkgs = path.join(ROOT, 'packages')
  for (const pkg of readdirSync(pkgs)) {
    const src = path.join(pkgs, pkg, 'src')
    let st
    try {
      st = statSync(src)
    } catch {
      continue
    }
    if (!st.isDirectory()) {
      continue
    }
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = path.join(dir, name)
        if (statSync(p).isDirectory()) {
          walk(p)
        } else if (/\.tsx?$/.test(name) && !name.endsWith('.d.ts')) {
          out.push(p)
        }
      }
    }
    walk(src)
  }
  return out.sort()
}

const gc = (globalThis as { gc?: () => void }).gc

async function measure(): Promise<{ heapUsed: number; arrayBuffers: number }> {
  // native buffers are released by finalizers that need a turn of the event loop after GC
  for (let i = 0; i < 5; i++) {
    gc?.()
    await new Promise((r) => setImmediate(r))
    await new Promise((r) => setTimeout(r, 1))
  }
  const m = process.memoryUsage()
  return { heapUsed: m.heapUsed, arrayBuffers: m.arrayBuffers }
}

interface CorpusStats {
  parseOnly: number
  compileTotal: number
  compiled: number
  untouched: number
  errors: number
}

async function runCorpus(
  files: Array<string>,
  texts: Map<string, string>,
  host: MemoryHost,
  planners: Array<ReturnType<typeof toySplitPlanner>>,
): Promise<CorpusStats> {
  const stats: CorpusStats = {
    parseOnly: 0,
    compileTotal: 0,
    compiled: 0,
    untouched: 0,
    errors: 0,
  }
  for (const f of files) {
    const code = texts.get(f)!
    const id = identify(f)
    const t0 = performance.now()
    const file = parse(code, {
      lang: id.lang ?? 'ts',
      semantic: true,
      preserveParens: true,
    })
    void file.program.body.length
    stats.parseOnly += performance.now() - t0
    const t1 = performance.now()
    try {
      const out = await host.compile(f, planners, { code, wantMap: false })
      if (out === null) {
        stats.untouched++
      } else {
        stats.compiled++
      }
    } catch (e) {
      stats.errors++
      if (stats.errors < 5) {
        console.error(f, e)
      }
    }
    stats.compileTotal += performance.now() - t1
  }
  return stats
}

describe('retained heap (gate l)', () => {
  it.skipIf(!gc)(
    'keeps only plain data after compiling the package corpus',
    async () => {
      const files = corpus()
      expect(files.length).toBeGreaterThan(500)
      const texts = new Map<string, string>()
      for (const f of files) {
        texts.set(f, readFileSync(f, 'utf8'))
      }
      const planners = [
        toyEnvPlanner(),
        toySplitPlanner(),
        toyEdgePolicyPlanner(),
      ]
      // warm up (Yuku's one-time buffers, JIT) with a throwaway host, then take the baseline
      {
        const warm = new MemoryHost({ files: {} })
        for (const f of files.slice(0, 5)) {
          await warm.compile(f, planners, {
            code: texts.get(f)!,
            wantMap: false,
          })
        }
      }
      const host = new MemoryHost({ files: {} })
      const before = await measure()
      // the corpus loop runs in its own frame so no local of this (still running) frame keeps a SourceFile alive
      const { parseOnly, compileTotal, compiled, untouched, errors } =
        await runCorpus(files, texts, host, planners)
      expect(errors).toBe(0)
      // drop everything but the caches
      texts.clear()
      const plans = host.caches.plans.get('client')!
      // flush Yuku's last native result before measuring
      void parse('export {}', { lang: 'ts' }).program.body.length
      const after = await measure()
      const heapDelta = after.heapUsed - before.heapUsed
      const abDelta = after.arrayBuffers - before.arrayBuffers
      const report = {
        files: files.length,
        compiled,
        untouched,
        plans: plans.size,
        heapDeltaMB: +(heapDelta / 1048576).toFixed(2),
        arrayBuffersDelta: abDelta,
        parseOnlyUsPerFile: +((parseOnly * 1000) / files.length).toFixed(1),
        compileUsPerFile: +((compileTotal * 1000) / files.length).toFixed(1),
        coreOverheadUsPerFile: +(
          ((compileTotal - parseOnly) * 1000) /
          files.length
        ).toFixed(1),
      }
      console.log(`gate (l) report: ${JSON.stringify(report)}`)
      expect(heapDelta).toBeLessThanOrEqual(5 * 1048576)
      expect(abDelta).toBeLessThanOrEqual(0)
    },
    120_000,
  )
})
