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
    // handlers: {
    //   GET: ({ context, next }) => {
    //     context.fromFetch
    //     context.fromServerMw
    //     context.fromTestServerMw
    //     return next()
    //   },
    // },
  },
  beforeLoad: ({ serverContext }) => {
    serverContext?.fromFetch
    //             ^?
    serverContext?.fromServerMw
    //             ^?
    serverContext?.fromTestServerMw
    //             ^?

    return {}
  },
  // ssr: false,
  loader: ({ serverContext }) => {
    serverContext?.fromFetch
    //             ^?
    serverContext?.fromServerMw
    //             ^?
    serverContext?.fromTestServerMw
    //             ^?

    return new Test()
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

class Test {
  constructor() {}
}
