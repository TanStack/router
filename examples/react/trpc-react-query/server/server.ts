import { initTRPC } from '@trpc/server'
import { createHTTPServer } from '@trpc/server/adapters/standalone'

const t = initTRPC.create()

const POSTS = [
  { id: '1', title: 'First post' },
  { id: '2', title: 'Second post' },
  { id: '3', title: 'Third post' },
]

const appRouter = t.router({
  hello: t.procedure.query(async () => {
    await new Promise((r) => setTimeout(r, 500))
    return 'Hello world!'
  }),
  posts: t.procedure.query(async (_) => {
    await new Promise((r) => setTimeout(r, 500))
    return POSTS
  }),
  post: t.procedure.input(String).query(async (req) => {
    await new Promise((r) => setTimeout(r, 500))
    return POSTS.find((p) => p.id === req.input)
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
