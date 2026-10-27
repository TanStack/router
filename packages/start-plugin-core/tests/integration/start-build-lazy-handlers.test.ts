/**
 * What a production server build evaluates, and when, for the modules that
 * define server fns (Vite and Rsbuild builds, Start's whole plugin, the
 * server bundle run by Start's own server entry inside a real request):
 * the modules only handlers import load on the first call, like main, and
 * nothing a server fn module evaluates runs twice, whether server code calls
 * the fn directly or a page calls it over HTTP.
 * Source: the real-app differential corpus (lbogerd/tictaak-start: a route
 * file whose handlers import the database module, which throws at load
 * without DATABASE_URL); issue #6451 (concurrent first calls of a server fn
 * whose handler's imports load slowly).
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import {
  buildStart,
  callByIdExports,
  callByIdPrelude,
  startBundlers,
} from '../build-harness'
import { createStartHost } from '../regression-helpers'
import type { StartBuild } from '../build-harness'
import type { StartHost } from '../regression-helpers'

const timeout = 60_000

const head = `import { createServerFn } from '@tanstack/react-start'\n`

/** A module counting its evaluations in `globalThis[name]`, exporting `value`. */
const counted = (name: string, value = `'${name}'`) =>
  `globalThis.${name} = (globalThis.${name} ?? 0) + 1
export const value = ${value}
`

const files = {
  // handler-only dependencies
  'heavy.server.ts': counted('MARK_HEAVY'),
  'deep.server.ts': counted('MARK_DEEP'),
  'slow.server.ts': `${counted('MARK_SLOW')}await new Promise((resolve) => setTimeout(resolve, 200))
`,
  'broken.server.ts': `throw new Error('MARK_BROKEN_AT_IMPORT')
export const value = 'unreachable'
`,
  'tla-dep.server.ts': counted('MARK_TLA_DEP'),
  'tla-for-dep.server.ts': counted('MARK_TLA_FOR_DEP'),
  // a module whose own code and handlers share state
  'fns.ts': `${head}import { value as heavy } from './heavy.server'
import { value as slow } from './slow.server'
import { value as deep } from './deep.server'
globalThis.MARK_FNS = (globalThis.MARK_FNS ?? 0) + 1
let label = 'initial'
export function setLabel(next: string) {
  label = next
}
let count = 0
export function readCount() {
  return count
}
export const getHeavy = createServerFn().handler(async () => heavy)
export const getSlow = createServerFn().handler(async () => slow)
export const readLabel = createServerFn().handler(async () => label)
export const bump = createServerFn().handler(async () => ++count)
export function makeNested() {
  const nested = createServerFn().handler(async () => deep)
  return nested
}
`,
  'broken.ts': `${head}import { value } from './broken.server'
export const callBroken = createServerFn().handler(async () => value)
`,
  // a module that awaits one of its own server fns while it evaluates, whose
  // handler reads the module's own state
  'tla.ts': `${head}import { value } from './tla-dep.server'
export const prefix = ['tla', ''].join(':')
export const tlaFn = createServerFn().handler(async () => prefix + value)
export const ready = await tlaFn()
`,
  // the same, awaiting it in a top-level `for await` loop
  'tla-for.ts': `${head}import { value } from './tla-for-dep.server'
export const prefix = ['tla-for', ''].join(':')
export const tlaForFn = createServerFn().handler(async () => prefix + value)
export const results: Array<string> = []
for await (const result of [tlaForFn()]) {
  results.push(result)
}
`,
  'client-entry.ts': `export * from './fns'
export { callBroken } from './broken'
export const loadTla = () => import('./tla')
export const loadTlaFor = () => import('./tla-for')
`,
  'ssr-entry.ts': `export * from './client-entry'
${callByIdExports}`,
}

/** SSR script prelude: the evaluation counters of `files`. */
const counters = `const count = (name) => globalThis[name] ?? 0
const counts = (...names) =>
  Object.fromEntries(names.map((name) => [name, count('MARK_' + name.toUpperCase())]))
`

describe.each(startBundlers)('%s build', (bundler) => {
  let build: StartBuild
  const cleanups: Array<() => Promise<void>> = []

  beforeAll(async () => {
    build = await buildStart({
      bundler,
      files,
      entry: { client: 'client-entry.ts', ssr: 'ssr-entry.ts' },
      registerCleanup: (cleanup) => cleanups.push(cleanup),
    })
  }, timeout)

  afterAll(async () => {
    await Promise.all(cleanups.map((cleanup) => cleanup()))
  })

  test(
    'SSR: the server-only modules of handlers load on the first call, not with the module defining the fn',
    async () => {
      const { result } = await build.ssr
        .run(`${counters}const before = counts('fns', 'heavy')
const heavy = await entry.getHeavy()
return { before, heavy, after: counts('fns', 'heavy') }`)
      expect(result).toEqual({
        before: { fns: 1, heavy: 0 },
        heavy: 'MARK_HEAVY',
        after: { fns: 1, heavy: 1 },
      })
    },
    timeout,
  )

  test(
    'SSR: direct calls and calls over HTTP run one instance of the module and of what its handlers import',
    async () => {
      const { result } = await build.ssr
        .run(`${callByIdPrelude}${counters}const results = await Promise.all([
  ...Array.from({ length: 25 }, () => entry.getSlow()),
  ...Array.from({ length: 25 }, () => callById(serverFnId(entry.getSlow))),
])
return {
  results: [...new Set(results)],
  counts: counts('fns', 'slow'),
  overHttp: await callById(serverFnId(entry.getHeavy)),
  after: counts('fns', 'slow', 'heavy'),
}`)
      expect(result).toEqual({
        results: ['MARK_SLOW'],
        counts: { fns: 1, slow: 1 },
        overHttp: 'MARK_HEAVY',
        after: { fns: 1, slow: 1, heavy: 1 },
      })
    },
    timeout,
  )

  test(
    "SSR: a handler reads the module's current state, and a handler's writes are what the module reads",
    async () => {
      const { result } = await build.ssr
        .run(`${callByIdPrelude}entry.setLabel('changed')
const label = await entry.readLabel()
const overHttp = await callById(serverFnId(entry.readLabel))
await entry.bump()
await callById(serverFnId(entry.bump))
return { label, overHttp, count: entry.readCount() }`)
      expect(result).toEqual({
        label: 'changed',
        overHttp: 'changed',
        count: 2,
      })
    },
    timeout,
  )

  test(
    'SSR: the server-only module of a nested server fn loads on its first call',
    async () => {
      const { result } = await build.ssr
        .run(`${counters}const fn = entry.makeNested()
const before = counts('deep')
return { before, called: await fn(), after: counts('deep') }`)
      expect(result).toEqual({
        before: { deep: 0 },
        called: 'MARK_DEEP',
        after: { deep: 1 },
      })
    },
    timeout,
  )

  test(
    'SSR: a handler-only module that throws at load fails only the calls of that fn',
    async () => {
      const { result } = await build.ssr.run(`const settle = async (run) => {
  try {
    return { value: await run() }
  } catch (error) {
    return { error: String(error?.message ?? error) }
  }
}
return {
  broken: await settle(() => entry.callBroken()),
  other: await settle(() => entry.getHeavy()),
}`)
      expect(result).toEqual({
        broken: { error: expect.stringContaining('MARK_BROKEN_AT_IMPORT') },
        other: { value: 'MARK_HEAVY' },
      })
    },
    timeout,
  )

  test(
    'SSR: a module that awaits one of its own server fns at its top level evaluates',
    async () => {
      const { result } = await build.ssr.run(`const tla = await entry.loadTla()
return { ready: tla.ready, again: await tla.tlaFn(), dep: globalThis.MARK_TLA_DEP }`)
      expect(result).toEqual({
        ready: 'tla:MARK_TLA_DEP',
        again: 'tla:MARK_TLA_DEP',
        dep: 1,
      })
    },
    timeout,
  )

  test(
    'SSR: a module that awaits one of its own server fns in a top-level for await loop evaluates',
    async () => {
      const { result } = await build.ssr
        .run(`const tla = await entry.loadTlaFor()
return { results: tla.results, again: await tla.tlaForFn(), dep: globalThis.MARK_TLA_FOR_DEP }`)
      expect(result).toEqual({
        results: ['tla-for:MARK_TLA_FOR_DEP'],
        again: 'tla-for:MARK_TLA_FOR_DEP',
        dep: 1,
      })
    },
    timeout,
  )
})

// `@vitejs/plugin-vue` serves an SFC's `<script lang="ts">` block in builds
// as a module of its own (`Page.vue?vue&type=script&lang.ts`); its
// handlers' server-only modules load on the first call like any module's.
describe('vite build of a Vue app', () => {
  let host: StartHost | undefined
  afterAll(() => host?.close())

  test(
    'SSR: the server-only module of a handler in a <script lang="ts"> block is not loaded with the SFC',
    async () => {
      host = await createStartHost({ framework: 'vue', serve: false })
      const startCase = await host.case({
        'Page.vue': `<script lang="ts">
import { createServerFn } from '@tanstack/vue-start'
import { db } from './db.server'
const input = <string>(globalThis as any).input
export const fn = createServerFn().handler(async () => db.x(input))
export default {}
</script>

<template>
  <p>page</p>
</template>
`,
        'db.server.ts': `export const db = { x: (input: string) => 'MARK_DB_SERVER:' + input }\n`,
        'module.ts': `export { fn } from './Page.vue'\n`,
      })
      const build = await host.build()
      const { chunks } = build.environments.ssr!
      const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]))
      const page = startCase.file('Page.vue')
      // (the SFC module itself, which imports its blocks)
      const own = chunks.filter((chunk) => chunk.moduleIds.includes(page))
      expect(own.length, 'SSR chunks of the SFC').toBeGreaterThan(0)
      // the SFC's chunks and every chunk they import statically
      const loaded = new Set(own)
      for (const chunk of loaded) {
        for (const name of chunk.imports) {
          const next = byName.get(name)
          if (next) {
            loaded.add(next)
          }
        }
      }
      expect({
        withTheSfc: [...loaded].some((chunk) =>
          chunk.code.includes('MARK_DB_SERVER'),
        ),
        inTheBuild: chunks.some((chunk) =>
          chunk.code.includes('MARK_DB_SERVER'),
        ),
      }).toEqual({ withTheSfc: false, inTheBuild: true })
    },
    timeout,
  )
})
