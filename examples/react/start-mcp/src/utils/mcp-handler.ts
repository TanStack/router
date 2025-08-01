import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { getEvent } from '@tanstack/react-start/server'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export async function handleMcpRequest(request: Request, server: McpServer) {
  const body = await request.json()
  const event = getEvent()
  const res = event.node.res
  const req = event.node.req

  return new Promise<Response>((resolve, reject) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    })

    const cleanup = () => {
      transport.close()
      server.close()
    }

    let settled = false
    const safeResolve = (response: Response) => {
      if (!settled) {
        settled = true
        cleanup()
        resolve(response)
      }
    }

    const safeReject = (error: any) => {
      if (!settled) {
        settled = true
        cleanup()
        reject(error)
      }
    }

    res.on('finish', () => safeResolve(new Response(null, { status: 200 })))
    res.on('close', () => safeResolve(new Response(null, { status: 200 })))
    res.on('error', safeReject)

    server
      .connect(transport)
      .then(() => transport.handleRequest(req, res, body))
      .catch((error) => {
        console.error('Transport error:', error)
        cleanup()
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              error: { code: -32603, message: 'Internal server error' },
              id: null,
            }),
          )
        }
        safeReject(error)
      })
  })
}
