import { createFileRoute } from '@tanstack/react-router'
import { startInstance } from '~/start'

export const testServerMw = startInstance
  .createMiddleware()
  .server(({ next, context }) => {
    context.fromFetch

    return next({
      context: {
        fromTestServerMw: true,
      },
    })
  })

export const testFnMw = startInstance
  .createMiddleware({ type: 'function' })
  .middleware([testServerMw])
  .server(({ next, context }) => {
    context.fromFetch
    context.fromTestServerMw

    return next({
      context: {
        fromTestFnMw: true,
      },
    })
  })

export const Route = createFileRoute('/')({
  server: {
    middleware: [testServerMw],
    handlers: {
      GET: ({ context, next }) => {
        context.fromFetch
        context.fromServerMw
        context.fromTestServerMw
        return next({})
      },
    },
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
