import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { renderToStream } from '@ssrx/react/server'
import { Hono } from 'hono'

import * as entry from '~/entry.server.tsx'

const server = new Hono()
  /**
   * These two serveStatic's will be used to serve production assets.
   * Vite dev server handles assets during development.
   */
  .use('/assets/*', serveStatic({ root: './dist/public' }))
  .use('/favicon.ico', serveStatic({ path: './dist/public/favicon.ico' }))

  .get('*', async (c) => {
    try {
      const { app, router } = await entry.render(c.req.raw)

      const { stream, statusCode } = await renderToStream({
        app: () => app,
        req: c.req.raw,
        injectToStream: [
          /**
           * Automatically inject assets into the stream if preferred, vs manually adding them to the head/body through route context
           * import { injectAssetsToStream } from @ssrx/react/server;
           */
          // await injectAssetsToStream({ req: c.req.raw }),
          {
            async emitBeforeStreamChunk() {
              const injectorPromises = router.injectedHtml.map((d) =>
                typeof d === 'function' ? d() : d,
              )
              const injectors = await Promise.all(injectorPromises)
              router.injectedHtml = []
              return injectors.join('')
            },
          },
        ],
      })

      let status = statusCode()

      // Handle redirects
      if (router.hasNotFoundMatch() && status !== 500) status = 404

      return new Response(stream, {
        status,
        headers: { 'Content-Type': 'text/html' },
      })
    } catch (err: any) {
      /**
       * In development, pass the error back to the vite dev server to display in the
       * vite error overlay
       */
      if (import.meta.env.DEV) return err

      throw err
    }
  })

/**
 * In development, vite handles starting up the server
 * In production, we need to start the server ourselves
 */
if (import.meta.env.PROD) {
  const port = Number(process.env['PORT'] || 3000)
  serve(
    {
      port,
      fetch: server.fetch,
    },
    () => {
      console.log(`🚀 Server running at http://localhost:${port}`)
    },
  )
}

export default server
