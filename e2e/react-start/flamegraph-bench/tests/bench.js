import autocannon from 'autocannon'

const BASE_URL = 'http://localhost:3000'

const instance = autocannon({
  url: BASE_URL,
  connections: 100, // concurrent connections
  duration: 30, // seconds
  pipelining: 1, // requests per connection
  requests: [
    {
      setupRequest: (req) => {
        // Pick a random page for each request
        const randomPage = '/page/' + Math.floor(Math.random() * 1000)
        return { ...req, path: randomPage }
      },
    },
  ],
})

autocannon.track(instance, { renderProgressBar: true })

instance.on('done', (results) => {
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

  // Exit after a short delay to allow the server profiler to finish
  setTimeout(() => process.exit(0), 1000)
})
