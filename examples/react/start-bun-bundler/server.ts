/**
 * Production host for the Bun-bundler example (static + SSR).
 * Prefer `bun run dist/server/host.js` after build (same behavior, generated).
 */
const CLIENT_DIR = new URL('./dist/client/', import.meta.url).pathname
const SERVER_ENTRY = new URL('./dist/server/server.js', import.meta.url).pathname

const handler = (await import(SERVER_ENTRY)) as {
  default: { fetch: (req: Request) => Response | Promise<Response> }
}

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  hostname: process.env.HOST ?? '0.0.0.0',
  async fetch(req) {
    const url = new URL(req.url)
    if (url.pathname.startsWith('/assets/') || /\.\w+$/.test(url.pathname)) {
      const relative = decodeURIComponent(url.pathname.replace(/^\//, ''))
      if (!relative.includes('..')) {
        const file = Bun.file(`${CLIENT_DIR}${relative}`)
        if (await file.exists()) {
          return new Response(file)
        }
      }
    }
    return handler.default.fetch(req)
  },
})

console.info(`[start-bun-bundler] http://localhost:${server.port}`)
