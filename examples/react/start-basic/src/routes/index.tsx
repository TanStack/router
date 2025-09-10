import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  server: {
    // handlers: ({ createHandlers }) =>
    //   createHandlers({
    //     GET: ({ next }) => {
    //       return next({
    //         context: {
    //           test: true,
    //         },
    //       })
    //     },
    //     POST: ({ next }) => {
    //       return next({
    //         context: {
    //           wrong: true,
    //         },
    //       })
    //     },
    //   }),
    handlers: {
      GET: ({ next }) => {
        return next({
          context: {
            test: true,
          },
        })
      },
      POST: ({ next }) => {
        return next({
          context: {
            wrong: true,
          },
        })
      },
    },
  },
  beforeLoad: (ctx) => {
    ctx.serverContext
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
