// A license comment holding a JSX pragma, in a real Rspack build: SWC reads
// JSX pragmas in block comments only, so the split chunk must carry the
// pragma in a block comment (the notice itself stays in the route module,
// SPEC G12), and a pragma name without a value on its line is no pragma
// there either (SPEC J2.16). The outcome is the computed colour of the
// styled element in a real browser, Emotion's `css` prop applied or left as
// a plain attribute. The Vite rows are in ../code-splitter-pragmas.test.ts.
// Source: emit review re-check (Fable R1; Astra 1, Gemini 1)
import { describe, expect, test } from 'vitest'
import { expectDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import { build, routeApp, routeHead } from '../build-harness'

const timeout = 120_000

const styledRoute = (header: string) => `${header}${routeHead()}
function Page() {
  return <div id="styled" css={{ color: 'red' }}>MARK_STYLED</div>
}
export const Route = createFileRoute('/')({ component: Page })
`

/** Builds the route for the browser (split or untouched) and reads the colour its component's element gets. */
async function styledColour(header: string, autoCodeSplitting: boolean) {
  const app = await build({
    bundler: 'rspack',
    env: 'client',
    pluginOptions: { autoCodeSplitting },
    files: routeApp(styledRoute(header), { env: 'client' }),
  })
  const run = await app.run(`await entry.mount(entry.Route.options.component)
return getComputedStyle(document.getElementById('styled')).color`)
  expect(run.html).toContain('MARK_STYLED')
  return { app, colour: run.result as string }
}

describe('a license comment holding a JSX pragma, on Rspack', () => {
  test.each([
    {
      name: 'the pragma in effect',
      header: `/**\n * @license MIT\n * @jsxImportSource @emotion/react\n */\n`,
      styled: true,
    },
    // SWC reads a pragma that starts its line (after one `*`) only: one
    // after other text on its line is no pragma there, in the source as in
    // the chunk's copy. Source: emit review re-check (Fable N2, cbe1503a9e)
    {
      name: 'a pragma after the `!` of the comment on its line',
      header: `/*! @jsxImportSource @emotion/react */\n`,
      styled: false,
    },
    {
      name: 'a pragma after `@license` on its line',
      header: `/** @license MIT @jsxImportSource @emotion/react */\n`,
      styled: false,
    },
    {
      name: 'a pragma name with its value on the next line',
      header: `/**\n * @license MIT\n * @jsxImportSource\n * @emotion/react\n */\n`,
      styled: false,
    },
    {
      name: 'a pragma name with no value on its line',
      header: `/**\n * @license MIT\n * Note @jsx\n * Copyright\n */\n`,
      styled: false,
    },
  ])(
    '$name: the split route renders as the untouched route does',
    async ({ header, styled }) => {
      const untouched = await styledColour(header, false)
      expect(
        untouched.colour === 'rgb(255, 0, 0)',
        `precondition: SWC ${styled ? 'reads' : 'ignores'} the pragma in the untouched file (colour ${untouched.colour})`,
      ).toBe(styled)
      const split = await styledColour(header, true)
      if (split.app.where('MARK_STYLED') !== 'lazy') {
        expectDiagnostic(
          [...split.app.warnings, ...split.app.consoleMessages],
          {
            severity: 'warning',
            file: 'routes/index.tsx',
            root: split.app.root,
          },
        )
      }
      expect(split.colour).toBe(untouched.colour)
    },
    timeout,
  )
})
