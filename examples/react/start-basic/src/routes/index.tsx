import { createFileRoute } from '@tanstack/react-router'
import { createMiddleware, createServerFn } from '@tanstack/react-start'
import { Foo } from '~/Foo'

const indexMw = createMiddleware().server(({ next }) => {
  return next({
    context: {
      fromIndex: true,
    },
  })
})

export const Route = createFileRoute('/')({
  server: {
    middleware: [indexMw],
    // handlers: ({ createHandlers }) =>
    // createHandlers({
    //   GET: ({ next }) => {
    //     return next({
    //       context: {
    //         test: true,
    //       },
    //     })
    //   },
    //   POST: ({ next }) => {
    //     return next({
    //       context: {
    //         wrong: true,
    //       },
    //     })
    //   },
    // }),
    handlers: {
      GET: ({ next, context }) => {
        context.fromRequest
        context.fromIndex
        return next({
          context: {
            fromGet: true,
          },
        })
      },
      POST: ({ next, context }) => {
        context.fromRequest
        context.fromIndex
        return next({
          context: {
            fromPost: true,
          },
        })
      },
    },
  },
  beforeLoad: (ctx) => {
    ctx.serverContext?.fromRequest
    ctx.serverContext?.fromIndex
  },
  component: Home,
  loader: (ctx) => {
    ctx.serverContext?.fromRequest
    ctx.serverContext?.fromIndex
    return new Foo('hello')
  },
})

const fn = createServerFn()
  .middleware([indexMw])
  .handler(({ context }) => {
    context.fromGlobalFnMiddleware
    context.fromIndex
    //       ^?
    return null as any
  })

function Home() {
  return (
    <div className="p-2">
      <h3>Welcome Home!!!</h3>
    </div>
  )
}
