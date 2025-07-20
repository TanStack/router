import { derivePort, localDummyServer } from '@tanstack/router-e2e-utils'
import packageJson from '../../package.json' with { type: 'json' }
import { posts } from './posts'
import type { IncomingMessage, ServerResponse } from 'node:http'

export default async function setup() {
  const port = await derivePort(`${packageJson.name}-external`)

  const server = await localDummyServer(port)

  server.on('request', (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`)

    if (req.method === 'GET' && url.pathname.startsWith('/posts')) {
      const parts = url.pathname.split('/')

      if (parts.length === 2) {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify(posts))
        return
      }

      const postId = parseInt(parts[2])

      if (isNaN(postId)) {
        res.writeHead(404)
        res.end(JSON.stringify({ error: 'invalid post id' }))
        return
      }

      const post = posts.find((post) => post.id === postId)

      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(post))
    }
  })
}
