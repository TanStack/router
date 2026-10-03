// Run after identical main.html builds in each arm; no existing case is selected.
async function measure(page) {
  const origin = 'http://127.0.0.1:4180'
  const results = []
  for (let block = 0; block < 8; block++) {
    const arms = block % 2 ? ['final', 'baseline'] : ['baseline', 'final']
    const cases = [
      'nonroot-retained-fixed',
      'nonroot-retained-updaters',
      'deep-retained-fixed',
      'deep-retained-updaters',
    ]
    const rotated = [
      ...cases.slice(block % cases.length),
      ...cases.slice(0, block % cases.length),
    ]
    for (const arm of arms) {
      for (const workload of rotated) {
        await page.goto(
          `${origin}/${arm === 'baseline' ? 'baseline-final' : 'selected-final'}/browser/index.html?case=${workload}`,
        )
        const preflight = await page.evaluate(async () => {
          const result = await window.linkPresentationBenchmark.preflight()
          for (let i = 0; i < 12; i++) {
            await window.linkPresentationBenchmark.sample()
          }
          return result
        })
        const samples = await page.evaluate(async () => {
          const samples = []
          for (let i = 0; i < 24; i++) {
            samples.push(await window.linkPresentationBenchmark.sample())
          }
          return samples
        })
        const cdp = await page.context().newCDPSession(page)
        const events = []
        cdp.on('Tracing.dataCollected', (data) => events.push(...data.value))
        await cdp.send('Tracing.start', {
          categories: 'toplevel,devtools.timeline,blink.user_timing',
          transferMode: 'ReportEvents',
        })
        const traced = await page.evaluate(async () => {
          const samples = []
          for (let i = 0; i < 32; i++) {
            samples.push(await window.linkPresentationBenchmark.sample())
          }
          return samples
        })
        const complete = new Promise((resolve) =>
          cdp.once('Tracing.tracingComplete', resolve),
        )
        await cdp.send('Tracing.end')
        await complete
        await cdp.detach()
        const traceSamples = traced.map((sample) => {
          const mark = events.find(
            (event) => event.name === `link-click-start-${sample.sampleId}`,
          )
          const tasks = mark
            ? events.filter(
                (event) =>
                  event.ph === 'X' &&
                  event.pid === mark.pid &&
                  event.tid === mark.tid &&
                  event.ts <= mark.ts &&
                  event.ts + event.dur >= mark.ts &&
                  (event.name === 'RunTask' ||
                    event.name === 'ThreadControllerImpl::RunTask'),
              )
            : []
          const task = tasks.sort((a, b) => b.dur - a.dur)[0]
          if (!task) {
            throw new Error(
              `Missing task trace: ${arm}/${workload}/${sample.sampleId}`,
            )
          }
          return {
            ...sample,
            enclosingTask: {
              name: task.name,
              durationMs: task.dur / 1000,
              clickToTaskEndMs: (task.ts + task.dur - mark.ts) / 1000,
            },
          }
        })
        results.push({ arm, block, workload, preflight, samples, traceSamples })
      }
    }
  }
  return { userAgent: await page.evaluate(() => navigator.userAgent), results }
}
