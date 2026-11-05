import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'

/** Static routes under /api/many/r{n}; keep in sync with gen-many-routes.mjs. */
export const MANY_ROUTE_COUNT = 200

/** Reference point: the same route table on Hono, with no Start involved. */
type Env = { Variables: { a: number; b: number; c: number } }

const set = (key: keyof Env['Variables'], value: number) =>
  createMiddleware<Env>(async (c, next) => {
    c.set(key, value)
    await next()
  })

export const honoApp = new Hono<Env>()

honoApp.get('/api/health', (c) => c.json({ ok: true }))

honoApp.get('/api/users/:id', (c) => {
  const id = c.req.param('id')
  return c.json({ id, name: `user-${id}`, roles: ['a', 'b', 'c'] })
})

honoApp.use('/api/admin/*', set('a', 1), set('b', 2), set('c', 3))
honoApp.get('/api/admin/:id', (c) =>
  c.json({
    id: c.req.param('id'),
    total: c.get('a') + c.get('b') + c.get('c'),
  }),
)

for (let n = 0; n < MANY_ROUTE_COUNT; n++) {
  honoApp.get(`/api/many/r${n}`, (c) => c.json({ n }))
}
