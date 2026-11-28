/**
 * A real compiler warning reaching the user (SPEC G5, J2.19, J7.3): React's RSC
 * CSS transform cannot give a `renderToReadableStream` call its styles when the
 * argument is not JSX it can see (a variable, a spread), so the stream renders
 * without its CSS; in development the user is told, once per file, naming the
 * module (the file and the API), on whichever channel the host prints it (SPEC
 * §5.7: console, logger or bundler, all read together). SPEC J7.3 asks for the
 * warning in development only: builds are not required to warn.
 *
 * The app is a React Start app with RSC enabled, on each host's dev server,
 * through the public plugins (`rsc-warning-app.ts`). A request of its page
 * makes the server run both server functions, so the modules holding the
 * calls were compiled for the server (the precondition: the page shows the
 * streamed component); then the warning is read.
 *
 * This replaces, as compiler acceptance, the former synthetic
 * `compilerTransforms` warning plumbing tests. The Vite dev twin with a real
 * page and CSS is react-start-rsc's `tests/integration/rsc-css.test.ts` ("dev:
 * renderToReadableStream with $name warns, naming the file").
 */
import { describe, expect, test } from 'vitest'
import { expectDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import { startRsbuildRscApp, startViteRscApp } from './rsc-warning-app'

const timeout = 30_000

/** A server function module streaming `<Card />` through `body`. */
const streamingModule = (
  name: string,
  body: string,
) => `import { createServerFn } from '@tanstack/react-start'
import { renderToReadableStream } from '@tanstack/react-start/rsc'
function Card() {
  return <div>MARK_CARD</div>
}
export const ${name} = createServerFn().handler(async () => {
${body}
})
`

/** The calls the transform cannot see the JSX of. */
const skipped = {
  identifier: {
    file: 'src/rows/identifier.tsx',
    code: streamingModule(
      'identifier',
      `  const node = <Card />
  return new Response(renderToReadableStream(node)).text()`,
    ),
  },
  spread: {
    file: 'src/rows/spread.tsx',
    code: streamingModule(
      'spread',
      `  const args = [<Card />] as const
  return new Response(renderToReadableStream(...args)).text()`,
    ),
  },
}

const files = {
  [skipped.identifier.file]: skipped.identifier.code,
  [skipped.spread.file]: skipped.spread.code,
  'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { identifier } from '../rows/identifier'
import { spread } from '../rows/spread'
export const Route = createFileRoute('/')({
  loader: async () => [await identifier(), await spread()],
  component: Page,
})
function Page() {
  const streams = Route.useLoaderData()
  return <p>{streams.every((stream) => stream.includes('MARK_CARD')) ? 'MARK_STREAMED' : 'MARK_MISSING'}</p>
}
`,
}

const hosts = {
  'Vite dev': async () => {
    const server = await startViteRscApp(files)
    const page = await server.fetch('/')
    return { server, html: page.body }
  },
  'Rsbuild dev': async () => {
    const server = await startRsbuildRscApp(files)
    const page = await fetch(new URL('/', server.url))
    return { server, html: await page.text() }
  },
}

describe.each(Object.keys(hosts) as Array<keyof typeof hosts>)('%s', (host) => {
  // Bug on main: the transform (react-start-rsc src/plugin/rscCssTransform.ts,
  // `renderToReadableStream` branch) skips an argument that is not
  // top-level JSX (`isTopLevelJsx`) with `continue`, and reports nothing;
  // on Rsbuild, Start's compiler host would drop a warning of a transform
  // too (rsbuild/start-compiler-host.ts `warnTransformContext` calls the
  // transform context's `emitWarning`, which Rsbuild's `api.transform`
  // context does not have).
  // Impact: the stream renders without its styles and nothing tells the
  // developer why.
  // SPEC J7.3: warn in dev only. Real coverage of the warning's delivery,
  // replacing two tests of start-build-warnings.test.ts.
  test(
    'renderToReadableStream with a variable or a spread warns once per file, naming the module',
    async () => {
      const { server, html } = await hosts[host]()
      // (the server ran both calls: their modules were compiled for it)
      expect(html).toContain('MARK_STREAMED')
      for (const { file } of Object.values(skipped)) {
        expectDiagnostic(server.diagnostics, {
          severity: 'warning',
          file,
          root: server.root,
          times: 1,
        })
      }
    },
    timeout,
  )
})
