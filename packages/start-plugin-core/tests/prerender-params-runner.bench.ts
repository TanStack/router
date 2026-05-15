import { bench, describe } from 'vitest'
import {
  collectPrerenderParams,
  runPrerenderParams,
} from '../src/prerender-params-runner'

const paramsCount = Number(process.env.TSS_PRERENDER_PARAMS_COUNT ?? 100_000)
const pageSize = 1_000
const pageCount = Math.ceil(paramsCount / pageSize)
const logger = {
  warn: () => {},
}
const noopOnPage = () => {}

function createRouteTree(prerenderParams: () => unknown) {
  return {
    options: {},
    children: [
      {
        id: '/posts/$slug',
        fullPath: '/posts/$slug',
        options: {
          id: '/posts/$slug',
          prerenderParams,
        },
      },
    ],
  } as any
}

function createArrayEntries() {
  return Array.from({ length: paramsCount }, (_, i) => ({
    params: { slug: `post-${i}` },
  }))
}

const prebuiltArrayEntries = createArrayEntries()

function* syncGeneratorEntries() {
  for (let i = 0; i < paramsCount; i++) {
    yield { params: { slug: `post-${i}` } }
  }
}

async function* asyncGeneratorEntries() {
  for (let i = 0; i < paramsCount; i++) {
    yield { params: { slug: `post-${i}` } }
  }
}

async function fetchEntriesPage(page: number) {
  await Promise.resolve()
  const start = page * pageSize
  const length = Math.min(pageSize, paramsCount - start)

  return Array.from({ length }, (_, i) => ({
    params: { slug: `post-${start + i}` },
  }))
}

async function createPagedArrayEntries() {
  const entries = []

  for (let page = 0; page < pageCount; page++) {
    entries.push(...(await fetchEntriesPage(page)))
  }

  return entries
}

async function* asyncGeneratorPagedEntries() {
  for (let page = 0; page < pageCount; page++) {
    yield* await fetchEntriesPage(page)
  }
}

function runStreaming(prerenderParams: () => unknown) {
  return runPrerenderParams({
    routeTree: createRouteTree(prerenderParams),
    pages: [],
    logger,
    onPage: noopOnPage,
  })
}

function runCollect(prerenderParams: () => unknown) {
  return collectPrerenderParams({
    routeTree: createRouteTree(prerenderParams),
    pages: [],
    logger,
  })
}

describe(`prerenderParams streaming (${paramsCount} entries)`, () => {
  bench(
    'prebuilt sync array',
    () => runStreaming(() => prebuiltArrayEntries),
    { warmupIterations: 1 },
  )

  bench(
    'created sync array',
    () => runStreaming(() => createArrayEntries()),
    { warmupIterations: 1 },
  )

  bench(
    'created async array',
    () => runStreaming(async () => createArrayEntries()),
    { warmupIterations: 1 },
  )

  bench(
    'sync generator',
    () => runStreaming(() => syncGeneratorEntries()),
    { warmupIterations: 1 },
  )

  bench(
    'async generator',
    () => runStreaming(() => asyncGeneratorEntries()),
    { warmupIterations: 1 },
  )

  bench(
    'created async array from pages',
    () => runStreaming(() => createPagedArrayEntries()),
    { warmupIterations: 1 },
  )

  bench(
    'async generator from pages',
    () => runStreaming(() => asyncGeneratorPagedEntries()),
    { warmupIterations: 1 },
  )
})

describe(`prerenderParams collect (${paramsCount} entries)`, () => {
  bench(
    'prebuilt sync array',
    async () => {
      await runCollect(() => prebuiltArrayEntries)
    },
    { warmupIterations: 1 },
  )

  bench(
    'sync generator',
    async () => {
      await runCollect(() => syncGeneratorEntries())
    },
    { warmupIterations: 1 },
  )

  bench(
    'async generator',
    async () => {
      await runCollect(() => asyncGeneratorEntries())
    },
    { warmupIterations: 1 },
  )
})
