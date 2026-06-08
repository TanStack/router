import {
  computeSlopeBytesPerOperation,
  createScenarioResult,
  printScenarioResult,
  readPositiveIntegerEnv,
  writeScenarioResult,
} from '../../../../tools/result-utils.ts'
import type { MemorySample } from '../../../../tools/result-utils.ts'

interface StartRequestHandler {
  fetch: (request: Request) => Promise<Response> | Response
}

const scenario = {
  id: 'react.ssr.repeated-requests',
  label: 'React SSR repeated requests',
  framework: 'react',
  runtime: 'ssr',
  scenario: 'repeated-requests',
}

const requestInit = {
  method: 'GET',
  headers: {
    accept: 'text/html',
  },
} satisfies RequestInit

function requestUrlForIteration(iteration: number) {
  const slot = iteration % 32
  const q = `q-${slot}`
  const page = slot % 8

  if (slot % 4 === 0) {
    return `http://localhost/a-${slot}/b-${slot}/c-${slot}/d-${slot}?q=${q}&page=${page}&filter=memory`
  }

  if (slot % 4 === 1) {
    return `http://localhost/a-${slot}/b-${slot}/c-${slot}/d-next?filter=memory&page=${page}&q=${q}`
  }

  if (slot % 4 === 2) {
    return `http://localhost/a-${slot}/b-next/c-${slot}/d-${slot}?page=${page}&filter=memory&q=${q}`
  }

  return `http://localhost/a-next/b-${slot}/c-${slot}/d-${slot}?q=${q}&filter=memory&page=${page}`
}

async function runRequests(
  handler: StartRequestHandler,
  count: number,
  startIteration: number,
) {
  for (let index = 0; index < count; index++) {
    const iteration = startIteration + index
    const requestUrl = requestUrlForIteration(iteration)
    const response = await handler.fetch(new Request(requestUrl, requestInit))

    if (response.status !== 200) {
      throw new Error(
        `Request failed with non-200 status ${response.status} (${requestUrl})`,
      )
    }

    await response.text()
  }
}

function forceGc() {
  const gc = (globalThis as typeof globalThis & { gc?: () => void }).gc
  if (typeof gc !== 'function') {
    throw new Error('SSR memory benchmarks must run with node --expose-gc')
  }

  for (let index = 0; index < 6; index++) {
    gc()
  }
}

function readNodeMemory() {
  const memory = process.memoryUsage()

  return {
    rssBytes: memory.rss,
    heapUsedBytes: memory.heapUsed,
    heapTotalBytes: memory.heapTotal,
    externalBytes: memory.external,
    arrayBuffersBytes: memory.arrayBuffers,
  }
}

const startedAt = new Date()
const iterations = readPositiveIntegerEnv('MEMORY_BENCH_ITERATIONS', 1000)
const warmupIterations = readPositiveIntegerEnv(
  'MEMORY_BENCH_WARMUP_ITERATIONS',
  100,
)
const batchSize = readPositiveIntegerEnv('MEMORY_BENCH_BATCH_SIZE', 50)
const appModuleUrl = new URL('./dist/server/server.js', import.meta.url).href
const { default: handler } = (await import(appModuleUrl)) as {
  default: StartRequestHandler
}

await runRequests(handler, warmupIterations, 0)
forceGc()

const baseline = readNodeMemory()
const samples: Array<MemorySample> = []
let peakRssBytes = baseline.rssBytes
let peakHeapUsedBytes = baseline.heapUsedBytes
let peakExternalBytes = baseline.externalBytes
let peakArrayBuffersBytes = baseline.arrayBuffersBytes

for (let completed = 0; completed < iterations; completed += batchSize) {
  const nextBatchSize = Math.min(batchSize, iterations - completed)
  await runRequests(handler, nextBatchSize, warmupIterations + completed)

  const beforeGc = readNodeMemory()
  peakRssBytes = Math.max(peakRssBytes, beforeGc.rssBytes)
  peakHeapUsedBytes = Math.max(peakHeapUsedBytes, beforeGc.heapUsedBytes)
  peakExternalBytes = Math.max(peakExternalBytes, beforeGc.externalBytes)
  peakArrayBuffersBytes = Math.max(
    peakArrayBuffersBytes,
    beforeGc.arrayBuffersBytes,
  )

  forceGc()
  const afterGc = readNodeMemory()
  const iteration = completed + nextBatchSize
  samples.push({
    iteration,
    rssBytes: afterGc.rssBytes,
    heapUsedBytes: afterGc.heapUsedBytes,
    heapTotalBytes: afterGc.heapTotalBytes,
    retainedHeapDeltaBytes: afterGc.heapUsedBytes - baseline.heapUsedBytes,
    externalBytes: afterGc.externalBytes,
    arrayBuffersBytes: afterGc.arrayBuffersBytes,
    peakRssBytes,
    peakHeapUsedBytes,
    peakExternalBytes,
    peakArrayBuffersBytes,
  })
}

const finalSample = samples[samples.length - 1]!
const retainedHeapDeltaBytes =
  finalSample.heapUsedBytes - baseline.heapUsedBytes
const retainedHeapBytesPerOperation = retainedHeapDeltaBytes / iterations
const retainedHeapSlopeBytesPerOperation = computeSlopeBytesPerOperation(
  samples,
  (sample) => sample.retainedHeapDeltaBytes,
)
const result = createScenarioResult({
  ...scenario,
  startedAt,
  config: {
    iterations,
    warmupIterations,
    batchSize,
  },
  metrics: {
    baselineRssBytes: baseline.rssBytes,
    finalRssBytes: finalSample.rssBytes,
    peakRssBytes,
    baselineHeapUsedBytes: baseline.heapUsedBytes,
    finalHeapUsedBytes: finalSample.heapUsedBytes,
    retainedHeapDeltaBytes,
    retainedHeapBytesPerOperation,
    retainedHeapSlopeBytesPerOperation,
    peakHeapUsedBytes,
    baselineExternalBytes: baseline.externalBytes,
    finalExternalBytes: finalSample.externalBytes,
    peakExternalBytes,
    baselineArrayBuffersBytes: baseline.arrayBuffersBytes,
    finalArrayBuffersBytes: finalSample.arrayBuffersBytes,
    peakArrayBuffersBytes,
  },
  samples,
})

writeScenarioResult(result)
printScenarioResult(result)
