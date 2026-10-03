// Run with playwright-cli run-code --filename=... after serving all arm builds.
async function check(page) {
  const origin = 'http://127.0.0.1:4180'
  const results = {}
  for (const arm of ['baseline', 'unified-root', 'shape-retirement']) {
    await page.goto(`${origin}/${arm}/browser/pending.html`)
    const cdp = await page.context().newCDPSession(page)
    const events = []
    cdp.on('Tracing.dataCollected', (data) => events.push(...data.value))
    await cdp.send('Tracing.start', {
      categories: 'toplevel,devtools.timeline,blink.user_timing',
      transferMode: 'ReportEvents',
    })
    let result
    try {
      result = await page.evaluate(() => window.linkPresentationPending.check())
    } finally {
      const complete = new Promise((resolve) =>
        cdp.once('Tracing.tracingComplete', resolve),
      )
      await cdp.send('Tracing.end')
      await complete
      await cdp.detach()
    }
    const start = events.find((event) => event.name === 'pending-click-start')
    const current = events.find(
      (event) => event.name === 'pending-links-current',
    )
    const task =
      start &&
      events
        .filter(
          (event) =>
            event.ph === 'X' &&
            event.pid === start.pid &&
            event.tid === start.tid &&
            event.ts <= start.ts &&
            event.ts + event.dur >= start.ts &&
            (event.name === 'RunTask' ||
              event.name === 'ThreadControllerImpl::RunTask'),
        )
        .sort((a, b) => b.dur - a.dur)[0]
    if (
      !start ||
      !current ||
      !task ||
      current.pid !== start.pid ||
      current.tid !== start.tid ||
      current.ts < start.ts ||
      current.ts > task.ts + task.dur
    ) {
      throw new Error(
        `${arm}: retained Link DOM updates did not precede the first task boundary`,
      )
    }
    results[arm] = {
      ...result,
      clickToLinksCurrentMs: (current.ts - start.ts) / 1000,
      clickToTaskEndMs: (task.ts + task.dur - start.ts) / 1000,
    }
  }
  return results
}
