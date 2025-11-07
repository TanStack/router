import express from 'express'
import { createServer as createViteServer } from 'vite'

const app = express()

const vite = await createViteServer({
  server: { middlewareMode: true },
  appType: 'custom',
})

app.use(vite.middlewares)

app.use('*', async (req, res) => {
  try {
    const url = req.originalUrl

    let viteHead = await vite.transformIndexHtml(
      url,
      `<html><head></head><body><div id="app"></div></body></html>`,
    )

    viteHead = viteHead.substring(
      viteHead.indexOf('<head>') + 6,
      viteHead.indexOf('</head>'),
    )

    const entry = await vite.ssrLoadModule('/src/entry-server.tsx')
    
    // Test streaming by checking query param
    const useStreaming = req.query.stream === 'true'

    console.info('Rendering:', url, useStreaming ? '(streaming)' : '(string)')
    await entry.render({ req, res, head: viteHead, useStreaming })
  } catch (e) {
    vite.ssrFixStacktrace(e)
    console.error(e.stack)
    res.status(500).end(e.stack)
  }
})

const port = 3000
app.listen(port, () => {
  console.info(`Server running at http://localhost:${port}`)
  console.info(`Test SSR: http://localhost:${port}/`)
  console.info(`Test Streaming: http://localhost:${port}/?stream=true`)
})

