import { inferAsyncReturnType, initTRPC } from '@trpc/server'
import { createHTTPServer } from '@trpc/server/adapters/standalone'

const t = initTRPC.create()

const INVOICES = [
  { id: 1, title: 'First post' },
  { id: 2, title: 'Second post' },
  { id: 3, title: 'Third post' },
  { id: 4, title: 'Fourth post' },
  { id: 5, title: 'Fifth post' },
  { id: 6, title: 'Sixth post' },
  { id: 7, title: 'Seventh post' },
  { id: 8, title: 'Eighth post' },
  { id: 9, title: 'Ninth post' },
  { id: 10, title: 'Tenth post' },
]

const appRouter = t.router({
  hello: t.procedure.query(() => 'Hello world!'),
  posts: t.procedure.query(async (_) => {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    return INVOICES
  }),
  post: t.procedure.input(Number).query(async (req) => {
    await new Promise((resolve) => setTimeout(resolve, 500))
    return INVOICES.find((p) => p.id === req.input)
  }),
})

export type AppRouter = typeof appRouter

const server = createHTTPServer({
  router: appRouter,
  responseMeta() {
    return {
      headers: {
        'Access-Control-Allow-Origin': `*`,
        'Access-Control-Request-Method': '*',
        'Access-Control-Allow-Methods': 'OPTIONS, GET',
        'Access-Control-Allow-Headers': '*',
      },
      status: 200,
    }
  },
})

server.listen(4000)
