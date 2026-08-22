import { describe, expect, it } from 'vitest'
import { findRouteMatch, processRouteTree } from '../src/new-process-route-tree'
import {
  findRouteMatch as findRouteMatchOld,
  processRouteTree as processRouteTreeOld,
} from './wildcard-suffix-fixture.old'

/**
 * Benchmark for the offset-based wildcard suffix comparison in
 * `getNodeMatch` (new-process-route-tree.ts).
 *
 * The suffix check previously allocated `parts.slice(index).join('/')` per
 * suffixed-wildcard candidate per stack frame, copying the remainder of the
 * URL every time. The current implementation compares against the tail of
 * `path` using a character offset instead.
 *
 * Run with:
 *   RUN_BACKPRESSURE_PERF=1 pnpm nx run @tanstack/router-core:test:unit -- tests/wildcard-suffix.perf.test.ts
 */
const SUFFIXES = [
  '.json',
  '.txt',
  '.xml',
  '.md',
  '.yaml',
  '.html',
  '.csv',
  '.tsv',
]

function makeTree(process: typeof processRouteTree) {
  // ONE trie node (/files) holding 8 suffixed-wildcard candidates: every
  // frame reaching this node evaluates all 8 suffix checks.
  const routes = [
    '/',
    '/files',
    '/static/segment/path',
    ...SUFFIXES.map((s) => `/files/{$}${s}`),
    '/other',
    ...SUFFIXES.slice(0, 4).map((s) => `/other/{$}${s}`),
  ]
  return process({
    id: '__root__',
    isRoot: true,
    fullPath: '/',
    path: '/',
    children: routes.map((route) => ({
      id: route,
      fullPath: route,
      path: route.replace(/^\/|\/$/g, '') || '/',
    })),
  }).processedTree
}

function body(seed: number): string {
  let out = ''
  for (let i = 0; i < 40; i++) {
    out += String.fromCharCode(97 + ((seed * (i + 7) * 31) % 26)).repeat(4)
  }
  return '/' + out.replace(/(.{3})/g, '$1/')
}

// ~200-char URLs (~46 segments): right prefix, wrong suffix. Every candidate's
// suffix check runs and the old code copied ~200 chars per check, 8x per call.
const missPaths = Array.from({ length: 500 }, (_, i) => `/files${body(i)}.zzz`)
// same shape, but the last-checked candidate matches
const hitPaths = missPaths.map((p) => p.slice(0, -4) + SUFFIXES[0]!)
// realistic short URLs hitting various candidates
const realPaths = Array.from(
  { length: 500 },
  (_, i) => `/files${body(i).slice(0, 20)}${SUFFIXES[i % SUFFIXES.length]!}`,
)

function bench(
  fn: (p: string) => unknown,
  tree: ReturnType<typeof makeTree>,
  paths: Array<string>,
  ms: number,
): number {
  const end = performance.now() + ms
  let ops = 0
  while (performance.now() < end) {
    for (const p of paths)
      fn(p)
      // findRouteMatch memoizes per path; bypass so we measure matching itself
    ;(tree as any).matchCache.clear()
    ops += paths.length
  }
  return ops / (ms / 1000)
}

describe('wildcard suffix comparison benchmark', () => {
  const treeNew = makeTree(processRouteTree)
  const treeOld = makeTree(
    processRouteTreeOld as unknown as typeof processRouteTree,
  )

  it('old (slice/join) vs new (offset) on worst-case and realistic workloads', () => {
    const scenarios = [
      ['worst-case miss (~200ch URL)', missPaths],
      ['worst-case hit  (~200ch URL)', hitPaths],
      ['realistic mix   (~40ch URL) ', realPaths],
    ] as const

    for (const [label, paths] of scenarios) {
      // sanity: identical match results
      for (const p of paths.slice(0, 50)) {
        expect(findRouteMatch(p, treeNew)?.route.id).toBe(
          findRouteMatchOld(p, treeOld)?.route.id,
        )
      }
      const warm = (fn: (p: string) => unknown, t: any) =>
        bench(fn, t, paths, 300)
      warm((p) => findRouteMatch(p, treeNew), treeNew)
      warm((p) => findRouteMatchOld(p, treeOld), treeOld)
      const newOps = bench(
        (p) => findRouteMatch(p, treeNew),
        treeNew,
        paths,
        1000,
      )
      const oldOps = bench(
        (p) => findRouteMatchOld(p, treeOld),
        treeOld,
        paths,
        1000,
      )
      console.log(
        `${label}: old=${(1e6 / oldOps).toFixed(2)}us/match new=${(1e6 / newOps).toFixed(2)}us/match (${((oldOps / newOps - 1) * 100).toFixed(0)}% slower before)`,
      )
      expect(newOps).toBeGreaterThan(0)
    }
  }, 30000)
})
