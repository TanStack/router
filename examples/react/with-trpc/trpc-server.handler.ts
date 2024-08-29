import { defineEventHandler, toWebRequest } from 'vinxi/http'
import { initTRPC } from '@trpc/server'
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'

const t = initTRPC.create()

const INVOICES = [
  { id: '1', title: 'First post' },
  { id: '2', title: 'Second post' },
  { id: '3', title: 'Third post' },
  { id: '4', title: 'Fourth post' },
  { id: '5', title: 'Fifth post' },
  { id: '6', title: 'Sixth post' },
  { id: '7', title: 'Seventh post' },
  { id: '8', title: 'Eighth post' },
  { id: '9', title: 'Ninth post' },
  { id: '10', title: 'Tenth post' },
]

const appRouter = t.router({
  hello: t.procedure.query(() => 'Hello world!'),
  posts: t.procedure.query(async (_) => {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    return INVOICES
  }),
  post: t.procedure.input(String).query(async (req) => {
    await new Promise((resolve) => setTimeout(resolve, 500))
    return INVOICES.find((p) => p.id === req.input)
  }),
})

export type AppRouter = typeof appRouter

export default defineEventHandler((event) => {
  const request = toWebRequest(event)

  return fetchRequestHandler({
    endpoint: '/trpc',
    req: request,
    router: appRouter,
    createContext() {
      return {}
    },
  })
})
