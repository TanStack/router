import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import fastify from 'fastify'
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify'
import fastifyVite from '@fastify/vite'

import renderer from './renderer.tsx'
import { appRouter } from './routers/index.ts'

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error)
})

const server = fastify()

await server.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  trpcOptions: { router: appRouter },
})

await server.register(fastifyVite, {
  // this is the default
  dev: process.argv.includes('--dev'),
  renderer,
  root: resolve(dirname(fileURLToPath(import.meta.url)), '../..'),
  spa: false,
})

await server.vite.ready()

await server.listen({ port: 3000 })
