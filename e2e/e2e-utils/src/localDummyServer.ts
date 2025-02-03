import http from 'node:http'

// some tests redirect to an external host
// however, in CI this is unstable due to network conditions
// so here we spawn a local server to simulate the external host

export async function localDummyServer(port: number) {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end('Hello World')
  })
  const promise = new Promise<void>((resolve) => {
    server.listen(port, 'localhost', () => {
      console.log(`local dummy server running at http://localhost:${port}`)
      resolve()
    })
  })
  await promise

  return server
}
