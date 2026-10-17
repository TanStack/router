import { defineConfig } from 'vite'

export default defineConfig({
  root: import.meta.dirname,
  appType: 'custom',
  logLevel: 'silent',
  plugins: [
    {
      name: 'prerender-resource-fixture',
      configurePreviewServer(server) {
        if (process.env.PRERENDER_TEST_STARTUP_ERROR === 'true') {
          throw new Error('Preview startup failed')
        }
        return () => {
          server.middlewares.use(async (req, res, next) => {
            try {
              const { respond } = await import('./server.mjs')
              await respond(req, res)
            } catch (error) {
              next(error)
            }
          })
        }
      },
    },
  ],
})
