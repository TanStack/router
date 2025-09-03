import { createFileRoute } from '@tanstack/react-router'
import { createMiddleware } from '@tanstack/react-start'

const testParentMiddleware = createMiddleware({ type: 'request' }).server(
  async ({ next }) => {
    const result = await next({ context: { testParent: true } })
    return result
  },
)

const testMiddleware = createMiddleware({ type: 'request' })
  .middleware([testParentMiddleware])
  .server(async ({ next }) => {
    const result = await next({ context: { test: true } })
    return result
  })

export const Route = createFileRoute('/')({
  server: {
    middleware: [testMiddleware],
  },
  beforeLoad: async (ctx) => {
    ctx.serverContext?.test
  },
  component: Home,
})

function Home() {
  return (
    <div className="p-2">
      <h3>Welcome Home!!!</h3>
    </div>
  )
}
