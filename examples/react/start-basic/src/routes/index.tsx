import { createFileRoute } from '@tanstack/react-router'
import { createMiddleware } from '@tanstack/react-start'

const testParentMiddleware = createMiddleware({ type: 'request' }).server(
  async ({ next }) => {
    const result = await next({ context: { indexParent: true } })
    return result
  },
)

const indexMiddleware = createMiddleware({ type: 'request' })
  .middleware([testParentMiddleware])
  .server(async ({ next }) => {
    const result = await next({ context: { index: true } })
    return result
  })

const postMiddleware = createMiddleware({ type: 'request' }).server(
  async ({ next }) => {
    return next({ context: { postMiddleware: true } })
  },
)

export const Route = createFileRoute('/')({
  server: {
    middleware: [indexMiddleware],
    methods: (withMiddleware) => ({
      GET: ({ context }) => {
        context.rootMiddleware
        context.indexParent
        context.index
      },
      POST: withMiddleware({
        middleware: [postMiddleware],
        handler: ({ context }) => {
          context.rootMiddleware
          context.indexParent
          context.index
          context.postMiddleware
        },
      }),
    }),
  },
  beforeLoad: (ctx) => {
    ctx.serverContext?.rootMiddleware
    ctx.serverContext?.indexParent
    ctx.serverContext?.index
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
