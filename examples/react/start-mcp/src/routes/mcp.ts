import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { createServerFileRoute } from '@tanstack/react-start/server'
import z from 'zod'
import { handleMcpRequest } from '../utils/mcp-handler'
import { getCount } from '.'

const server = new McpServer({
  name: 'start-server',
  version: '1.0.0',
})

server.registerTool(
  'add',
  {
    title: 'Addition Tool',
    description: 'Add two numbers',
    inputSchema: {
      a: z.number().describe('The first number'),
      b: z.number().describe('The second number'),
    },
  },
  ({ a, b }) => ({
    content: [{ type: 'text', text: String(a + b) }],
  }),
)

server.registerResource(
  'counter-value',
  'count://',
  {
    title: 'Counter Resource',
    description: 'Returns the current value of the counter',
  },
  async (uri) => {
    const count = await getCount()
    return {
      contents: [
        {
          uri: uri.href,
          text: `The counter is at, ${count}!`,
        },
      ],
    }
  },
)

export const ServerRoute = createServerFileRoute('/mcp').methods({
  POST: async ({ request }) => handleMcpRequest(request, server),
})
