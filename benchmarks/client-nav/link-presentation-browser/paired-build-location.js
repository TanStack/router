// Run with playwright-cli run-code --filename=... after serving production dist.
async function measure(page) {
  const origin = 'http://127.0.0.1:4180'
  const armNames = [
    'baseline',
    'unified-root',
    'no-linear',
    'builder-iterative',
  ]
  const entry = 'build-location/build-location.html'
  // Four-arm Williams design: balance positions and immediate predecessors.
  // Repeat the complete design twice for eight independent paired blocks.
  const orders = [
    [0, 1, 3, 2],
    [1, 2, 0, 3],
    [2, 3, 1, 0],
    [3, 0, 2, 1],
  ]
  const cases = ['fresh-build', 'warm-hit', 'validated-build']
  const warmupBatches = 24
  const sampleBatches = 48
  const results = []
  for (let block = 0; block < 8; block++) {
    const arms = orders[block % orders.length].map((index) => armNames[index])
    // Rotate case order to avoid consistently measuring one case last.
    const workloads = cases.map(
      (_, index) => cases[(index + block) % cases.length],
    )
    for (const arm of arms) {
      for (const workload of workloads) {
        await page.goto(`${origin}/${arm}/${entry}`)
        const preflight = await page.evaluate(async () => {
          await window.buildLocationBenchmark.ready
          return window.buildLocationBenchmark.preflight()
        })
        await page.evaluate(
          async ({ workload, warmupBatches }) => {
            for (let index = 0; index < warmupBatches; index++) {
              window.buildLocationBenchmark.sample(workload)
              await new Promise((resolve) => setTimeout(resolve, 0))
            }
          },
          { workload, warmupBatches },
        )
        const samples = await page.evaluate(
          async ({ workload, sampleBatches }) => {
            const samples = []
            for (let index = 0; index < sampleBatches; index++) {
              samples.push(window.buildLocationBenchmark.sample(workload))
              await new Promise((resolve) => setTimeout(resolve, 0))
            }
            return samples
          },
          { workload, sampleBatches },
        )
        results.push({ arm, block, workload, preflight, samples })
      }
    }
  }
  return {
    userAgent: await page.evaluate(() => navigator.userAgent),
    batchSize: 1000,
    warmupBatches,
    sampleBatches,
    armNames,
    entry,
    orders,
    results,
  }
}
