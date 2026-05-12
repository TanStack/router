// End-to-end demo: a @remix-run/fetch-router app whose only route is the
// TanStack Router handler. Run with `node ./server.mjs` after `pnpm i`.
//
// This file uses .mjs so it works with Node's native ESM loader. In a real
// app you would compile through Vite or another bundler.

import { serve } from '@remix-run/node-serve'
import { createRouter as createServerRouter } from '@remix-run/fetch-router'
import { createRouterHandler } from '@tanstack/remix-router/server'
import { makeRouter } from './src/router.js'

const tsrHandler = createRouterHandler({
  createRouter: makeRouter,
})

const app = createServerRouter()
app.route('ANY', '/{*path}', tsrHandler)

serve(app.fetch, { port: 3000 })

console.log('listening on http://localhost:3000')
