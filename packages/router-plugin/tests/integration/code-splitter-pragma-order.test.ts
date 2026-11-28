// A JSX pragma comment and a directive of a route file, in both orders, in a
// real Vite build whose JSX transform is TypeScript's own
// (`transpileModule`, a project's pre plugin): TypeScript reads a pragma
// before the module's first statement only, and a directive is one, so the
// split modules must hold the copied comment and the directive in the
// source's order (SPEC J2.16). The outcome is the computed colour of the
// styled element in a real browser, Emotion's `css` prop applied or left as
// a plain attribute. Source: emit review re-check (Astra, cff87fa51e)
import ts from 'typescript'
import { describe, expect, test } from 'vitest'
import { expectDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import { tanstackRouter } from '../../src/vite'
import { build, routeApp, routeHead } from '../build-harness'

/** The project's JSX transform: TypeScript, before Vite's own. */
const typescriptJsx = {
  name: 'test:typescript-jsx',
  enforce: 'pre' as const,
  transform(code: string, id: string) {
    if (!/\.tsx$/.test(id.split('?')[0]!)) {
      return undefined
    }
    return {
      code: ts.transpileModule(code, {
        fileName: 'route.tsx',
        compilerOptions: {
          jsx: ts.JsxEmit.ReactJSX,
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ESNext,
        },
      }).outputText,
      map: null,
    }
  },
}

const styledRoute = (header: string) => `${header}${routeHead()}
function Page() {
  return <div id="styled" css={{ color: 'red' }}>MARK_STYLED</div>
}
export const Route = createFileRoute('/')({ component: Page })
`

/** Builds the route for the browser (split or untouched) and reads the colour its component's element gets. */
async function styledColour(header: string, autoCodeSplitting: boolean) {
  const app = await build({
    bundler: 'vite',
    env: 'client',
    pluginOptions: { autoCodeSplitting },
    // (the router plugin first, as a project lists it: its pre transform
    // runs before TypeScript's)
    routerPlugins: (config) => [tanstackRouter(config), typescriptJsx],
    files: routeApp(styledRoute(header), { env: 'client' }),
  })
  const run = await app.run(`await entry.mount(entry.Route.options.component)
return getComputedStyle(document.getElementById('styled')).color`)
  expect(run.html).toContain('MARK_STYLED')
  return { app, colour: run.result as string }
}

describe('a pragma comment and a directive, on Vite with TypeScript JSX', () => {
  test.each([
    {
      name: 'the pragma before the directive',
      header: `/** @jsxImportSource @emotion/react */\n'use client'\n`,
      styled: true,
    },
    {
      name: 'the pragma after the directive',
      header: `'use client'\n/** @jsxImportSource @emotion/react */\n`,
      styled: false,
    },
  ])(
    '$name: the split route renders as the untouched route does',
    async ({ header, styled }) => {
      const untouched = await styledColour(header, false)
      expect(
        untouched.colour === 'rgb(255, 0, 0)',
        `precondition: TypeScript ${styled ? 'reads' : 'ignores'} the pragma in the untouched file (colour ${untouched.colour})`,
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
  )
})
