// Run with playwright-cli run-code --filename=... after serving production dist.
async function measure(page) {
  const origin = await page.evaluate(() => location.origin)
  const results = {}
  for (const workload of [
    'departing',
    'retained-fixed',
    'retained-updaters',
    'fixed-path-updaters',
  ]) {
    await page.goto(`${origin}/?case=${workload}`)
    await page.evaluate(async () => {
      await window.linkPresentationBenchmark.ready
      await window.linkPresentationBenchmark.preflight()
      for (let i = 0; i < 12; i++) {
        await window.linkPresentationBenchmark.sample()
      }
    })
    const samples = await page.evaluate(async () => {
      const samples = []
      for (let i = 0; i < 100; i++) {
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
      return {
        ...sample,
        enclosingTask: task
          ? {
              name: task.name,
              durationMs: task.dur / 1000,
              clickToTaskEndMs: (task.ts + task.dur - mark.ts) / 1000,
            }
          : null,
      }
    })
    results[workload] = {
      samples,
      traceSamples,
      taskNames: [
        ...new Set(
          events
            .filter(
              (event) => event.ph === 'X' && event.cat.includes('toplevel'),
            )
            .map((event) => event.name),
        ),
      ],
    }
  }
  return { userAgent: await page.evaluate(() => navigator.userAgent), results }
}
