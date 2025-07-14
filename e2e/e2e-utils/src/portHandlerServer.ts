import http from 'node:http'
import getPort, { portNumbers } from 'get-port'
import { maxPort, minPort, serverIsRunning } from './getPort'

if (await serverIsRunning()) {
  await fetch('http://localhost:5600/stopServer', {
    method: 'POST',
  })
}

export async function portHandlerServer() {
  const issuedPorts: Record<string, number> = {}

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`)

    if (req.method === 'GET' && url.pathname === '/getPort') {
      const packageName = url.searchParams.get('packageName')

      if (!packageName) {
        res.writeHead(400, { 'Content-Type': 'application/text' })
        res.end('Missing package parameter')
        return
      }

      const packagePort = issuedPorts[packageName]
      let port = minPort

      if (packagePort) {
        port = packagePort
      } else {
        port = await getPort({ port: portNumbers(minPort, maxPort) })
        issuedPorts[packageName] = port
      }

      res.writeHead(200, { 'Content-Type': 'application/text' })
      res.end(JSON.stringify({ port }))
    }

    if (req.method === 'GET' && url.pathname === '/status') {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end('Is alive')
    }

    if (req.method === 'POST' && url.pathname === '/stopServer') {
      console.log('Stopping port handler server...')
      server.close()
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end('Port handler Server stopped')
    }
  })

  const promise = new Promise<void>((resolve) => {
    server.listen(5600, 'localhost', () => {
      console.log(`port handler server running at http://localhost:${5600}`)
      resolve()
    })
  })

  await promise

  return server
}

export default portHandlerServer
