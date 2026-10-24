import { expect, test } from 'vitest'
import { expectDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import { startRscDevServer, startRscRsbuildDevServer } from './rsc-app'

const files = {
  'src/stream.tsx': `import { createServerFn } from '@tanstack/react-start'
import { renderToReadableStream } from '@tanstack/react-start/rsc'
import styles from './stream.module.css'
function Card() { return <div className={styles.card}>MARK_STREAM</div> }
export const render = createServerFn().handler(async () => {
  const node = <Card />
  const args = [node] as const
  const first = renderToReadableStream(node)
  const second = renderToReadableStream(...args)
  await Promise.all([new Response(first).text(), new Response(second).text()])
  return 'MARK_STREAMS_RENDERED'
})
`,
  'src/stream.module.css': '.card { color: red }',
  'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { render } from '../stream'
export const Route = createFileRoute('/')({
  loader: () => render(),
  component: () => <div>{Route.useLoaderData()}</div>,
})
`,
}

// J7.3, G5: the real RSC integration currently skips identifier and
// spread arguments silently. Two calls in one file require one warning naming the file.
// G5 requires positions on errors, not on this warning; wording/channel are free.
// Rsbuild (the previous compiler) still skips them: its row stays pinned.
for (const bundler of ['vite', 'rsbuild'] as const) {
  ;(bundler === 'vite' ? test : test.fails)(
    `${bundler} dev warns about the CSS limitation once per source file, naming it`,
    async () => {
      const server = await (
        bundler === 'vite' ? startRscDevServer : startRscRsbuildDevServer
      )({
        files,
        browser: true,
      })
      const response = await fetch(server.url!)
      expect(response.ok).toBe(true)
      expect(await response.text()).toContain('MARK_STREAMS_RENDERED')
      expectDiagnostic(server.diagnostics, {
        severity: 'warning',
        file: 'src/stream.tsx',
        root: server.root,
        times: 1,
      })
    },
  )
}
