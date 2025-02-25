import { createEvent } from 'h3'
import fg from 'fast-glob'
import type { ViteDevServer } from 'vite'
import type { EventHandler } from 'h3'

export function registerDevServerMiddleware(
  root: string,
  viteServer: ViteDevServer,
) {
  const middlewareFiles = fg.sync([`${root}/src/server/middleware/**/*.ts`])

  middlewareFiles.forEach((file) => {
    viteServer.middlewares.use(async (req, res, next) => {
      const middlewareHandler: EventHandler = await viteServer
        .ssrLoadModule(file)
        .then((m: unknown) => (m as { default: EventHandler }).default)

      const result = await middlewareHandler(createEvent(req, res))

      if (!result) {
        next()
      }
    })
  })
}
