import http from 'node:http'

// some tests redirect to an external host
// however, in CI this is unstable due to network conditions
// so here we spawn a local server to simulate the external host

export async function localDummyServer(port: number) {
  const server = http.createServer((req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Request-Method', '*')
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET, POST')
    res.setHeader('Access-Control-Allow-Headers', '*')

    if (req.method === 'OPTIONS') {
      res.writeHead(200)
      res.end()
      return
    }
  })

  server.on('request', async (req, res) => {
    const url = new URL(req.url!, 'http://localhost')

    if (res.req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('Hello World')
    }
  })

  server.on('request', async (req, res) => {
    const url = new URL(req.url!, `http://localhost`)

    if (res.req.method === 'POST' && url.pathname === '/stop') {
      server.close()
      console.log(
        `stopped local dummy server running at http://localhost:${port}`,
      )

      res.writeHead(200)
      res.end()
    }
  })

  const startServer = new Promise<void>((resolve) => {
    server.listen(port, 'localhost', () => {
      console.log(
        `started local dummy server running at http://localhost:${port}`,
      )
      resolve()
    })
  })

  await startServer

  await new Promise((r) => setTimeout(r, 500))
  return server
}
