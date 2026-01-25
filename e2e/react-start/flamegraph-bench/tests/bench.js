import autocannon from 'autocannon'

const BASE_URL = process.env.SERVER_URL || 'http://localhost:3000'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function runAutocannon({
  url,
  duration,
  connections,
  overallRate,
  pageMode,
}) {
  const instance = autocannon({
    url,
    overallRate,
    connections,
    duration,
    requests: [
      {
        setupRequest: (req) => {
          if (pageMode === 'fixed') {
            return { ...req, path: '/page/0' }
          }

          // Default: random page per request
          const randomPage = '/page/' + Math.floor(Math.random() * 1000)
          return { ...req, path: randomPage }
        },
      },
    ],
  })

  autocannon.track(instance, { renderProgressBar: true })

  return await new Promise((resolve, reject) => {
    instance.on('done', resolve)
    instance.on('error', reject)
  })
}

async function main() {
  // Wait for the server to be ready. `concurrently` starts this process right
  // away, and we're running with flame's manual profiling mode.
  await sleep(3000)

  // Warm up the server/router before flame starts profiling.
  // `pnpm start:prof:delayed` uses `flame run --delay=6000`, so we do the warmup
  // inside that time window.
  console.log('\n=== Warmup (before profiling starts) ===')
  await runAutocannon({
    url: BASE_URL,
    overallRate: 10000,
    connections: 10,
    duration: 5,
    pageMode: 'fixed',
  })

  console.log('\n=== Measured run (profiling ON) ===')
  const results = await runAutocannon({
    url: BASE_URL,
    overallRate: 3000,
    connections: 10,
    duration: 30,
    pageMode: 'random',
  })

  console.log('\n=== SSR Benchmark Results ===')
  console.log(`Total requests: ${results.requests.total}`)
  console.log(`Requests/sec: ${results.requests.average}`)
  console.log(`Latency (avg): ${results.latency.average}ms`)
  console.log(`Latency (p99): ${results.latency.p99}ms`)
  console.log(
    `Throughput: ${(results.throughput.average / 1024 / 1024).toFixed(2)} MB/s`,
  )

  if (results.errors) {
    console.log(`Errors: ${results.errors}`)
  }

  // Give flame a moment to flush profiles after SIGTERM.
  await sleep(1000)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
