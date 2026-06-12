import { test } from '@playwright/test'
import type { CDPSession } from '@playwright/test'
import {
  computeSlopeBytesPerOperation,
  createScenarioResult,
  printScenarioResult,
  readPositiveIntegerEnv,
  writeScenarioResult,
} from '../../../../../tools/result-utils.ts'
import type { MemorySample } from '../../../../../tools/result-utils.ts'

const scenario = {
  id: 'react.client.repeated-navigation',
  label: 'React client repeated navigation',
  framework: 'react',
  runtime: 'client',
  scenario: 'repeated-navigation',
}

interface BrowserMemory {
  heapUsedBytes: number
  heapTotalBytes: number
  documents: number
  domNodes: number
  jsEventListeners: number
}

async function forceBrowserGc(client: CDPSession) {
  await client.send('HeapProfiler.collectGarbage')
}

async function readBrowserMemory(client: CDPSession): Promise<BrowserMemory> {
  const heap = await client.send('Runtime.getHeapUsage')
  const domCounters = await client.send('Memory.getDOMCounters')

  return {
    heapUsedBytes: heap.usedSize,
    heapTotalBytes: heap.totalSize,
    documents: domCounters.documents,
    domNodes: domCounters.nodes,
    jsEventListeners: domCounters.jsEventListeners,
  }
}

test('react client repeated navigation memory', async ({ page }) => {
  const startedAt = new Date()
  const iterations = readPositiveIntegerEnv('MEMORY_BENCH_ITERATIONS', 1000)
  const warmupIterations = readPositiveIntegerEnv(
    'MEMORY_BENCH_WARMUP_ITERATIONS',
    100,
  )
  const batchSize = readPositiveIntegerEnv('MEMORY_BENCH_BATCH_SIZE', 50)
  const client = await page.context().newCDPSession(page)

  await client.send('HeapProfiler.enable')
  await client.send('Runtime.enable')

  await page.goto('/')
  await page.waitForFunction(() => {
    return typeof (window as any).__memoryBenchmark?.runBatch === 'function'
  })

  await page.evaluate(
    (count) => (window as any).__memoryBenchmark.runBatch(count),
    warmupIterations,
  )
  await forceBrowserGc(client)

  const baseline = await readBrowserMemory(client)
  const samples: Array<MemorySample> = []
  let peakHeapUsedBytes = baseline.heapUsedBytes

  for (let completed = 0; completed < iterations; completed += batchSize) {
    const nextBatchSize = Math.min(batchSize, iterations - completed)
    await page.evaluate(
      (count) => (window as any).__memoryBenchmark.runBatch(count),
      nextBatchSize,
    )

    const beforeGc = await readBrowserMemory(client)
    peakHeapUsedBytes = Math.max(peakHeapUsedBytes, beforeGc.heapUsedBytes)

    await forceBrowserGc(client)
    const afterGc = await readBrowserMemory(client)
    const iteration = completed + nextBatchSize
    samples.push({
      iteration,
      heapUsedBytes: afterGc.heapUsedBytes,
      heapTotalBytes: afterGc.heapTotalBytes,
      retainedHeapDeltaBytes: afterGc.heapUsedBytes - baseline.heapUsedBytes,
      documents: afterGc.documents,
      domNodes: afterGc.domNodes,
      domNodeDelta: afterGc.domNodes - baseline.domNodes,
      jsEventListeners: afterGc.jsEventListeners,
      jsEventListenerDelta:
        afterGc.jsEventListeners - baseline.jsEventListeners,
      peakHeapUsedBytes,
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
      baselineHeapUsedBytes: baseline.heapUsedBytes,
      finalHeapUsedBytes: finalSample.heapUsedBytes,
      retainedHeapDeltaBytes,
      retainedHeapBytesPerOperation,
      retainedHeapSlopeBytesPerOperation,
      peakHeapUsedBytes,
      baselineDomNodes: baseline.domNodes,
      finalDomNodes: finalSample.domNodes,
      domNodeDelta: finalSample.domNodeDelta,
      baselineJsEventListeners: baseline.jsEventListeners,
      finalJsEventListeners: finalSample.jsEventListeners,
      jsEventListenerDelta: finalSample.jsEventListenerDelta,
    },
    samples,
  })

  writeScenarioResult(result)
  printScenarioResult(result)
})
