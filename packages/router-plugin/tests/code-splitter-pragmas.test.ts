// Fast-tier half of this suite. The real-project rows (a JSX transform that
// reads pragmas anywhere, React Refresh and solid-refresh pragmas in a page)
// are in integration/code-splitter-pragmas.test.ts.
//
// Each route runs in a real browser page (`./route-app`): the real
// `@vitejs/plugin-react` transform (Oxc, which reads leading pragmas only),
// the real React and the real `@emotion/react`. The untouched route file is
// the same source as another module of the app that no route registers:
// the project's transform without the router's compilers.
import { expectDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import { describe, expect, it } from 'vitest'
import { head, loadRoute } from './route-app'
import type { RouteApp, RouteAppOptions } from './route-app'

/** The untouched copy of the route file (see the header). */
const untouchedFile = 'untouched.tsx'

/** Dependencies the page needs pre-bundled: Emotion and its JSX runtimes. */
const prebundle = [
  '@emotion/react',
  '@emotion/react/jsx-runtime',
  '@emotion/react/jsx-dev-runtime',
]

/** Loads a route next to its untouched copy (see the header). */
function loadWithUntouched(code: string, options: RouteAppOptions = {}) {
  return loadRoute(code, {
    ...options,
    prebundle,
    files: { ...options.files, [untouchedFile]: code },
  })
}

/**
 * In-page expression of the untouched file's route options; the run fails
 * when the router's compilers changed that copy (it must be the control).
 */
const untouched = `(await (async () => {
  const options = (await app(${JSON.stringify(untouchedFile)})).Route.options
  if (options.component && 'preload' in options.component) {
    throw new Error('the untouched copy was compiled as a route')
  }
  return options
})())`

/**
 * Whether Emotion styled the markup: rendered by the client, Emotion gives
 * the element a class it generated from the styles; the project's default
 * JSX runtime leaves a `css` prop as a plain attribute instead.
 */
const emotionStyled = (html: string) => /class="css-/.test(html)

/**
 * Loads the route (splitting it) and asserts that its component renders
 * what the untouched file renders, through the same real transform and
 * renderer: the JSX runtime decision of the file (its pragmas, leading or
 * not, as the project's transform reads them) holds in every module holding
 * its JSX (SPEC J2.16). A component left unsplit is accepted with a warning
 * naming the file and the option (SPEC J2.16, J2.8). Returns the rendering.
 */
async function expectRendersLikeUntouched(code: string) {
  const route = await loadWithUntouched(code)
  const [rendered, expected] = await route.run<[string, string]>(
    `return [await render('component'), await renderComponent(${untouched}.component)]`,
  )
  if (!(await route.isLazy('component'))) {
    expectDiagnostic(await route.diagnostics(), {
      severity: 'warning',
      file: 'route.tsx',
      root: route.host.root,
    })
  }
  expect(rendered).toBe(expected)
  return expected
}

// JSX pragmas apply per module: the code splitter runs before the bundler's
// JSX transform, which then runs on each split module separately, so a module
// without the pragma compiles its JSX with the project default runtime (e.g.
// `css` props are no longer handled by Emotion).
describe('split modules keep file-level JSX pragmas', () => {
  const styledRoute = (
    header: string,
  ) => `${header}export const Route = createFileRoute('/')({
  component: () => <div css={{ color: 'red' }}>styled</div>,
})
`

  it.each([
    ['on the first import', `/** @jsxImportSource @emotion/react */\n${head}`],
    ['as a line comment', `// @jsxImportSource @emotion/react\n${head}`],
    [
      'inside a file header',
      `/**\n * Header\n * @jsxImportSource @emotion/react\n */\n${head}`,
    ],
  ])('keeps @jsxImportSource %s in effect', async (_, header) => {
    const rendered = await expectRendersLikeUntouched(styledRoute(header))
    expect(emotionStyled(rendered)).toBe(true)
  })

  // The component calls the factory itself too, so the chunk keeps its
  // import whatever dead-code elimination counts as a use (a chunk whose
  // only use of the factory is its JSX: pinned in
  // known-bugs-code-splitter.test.ts, "classic JSX pragmas").
  it('keeps @jsxRuntime classic and @jsx pragmas in effect', async () => {
    const rendered =
      await expectRendersLikeUntouched(`/** @jsxRuntime classic */
/** @jsx jsx */
${head}import { jsx } from '@emotion/react'
export const Route = createFileRoute('/')({
  component: () => <div css={{ color: 'red' }}>{jsx('b', null, 'styled')}</div>,
})
`)
    expect(emotionStyled(rendered)).toBe(true)
  })

  const sharedJsxRoute = `/** @jsxImportSource @emotion/react */
${head}const icon = <svg css={{ width: 1 }} />
export const Route = createFileRoute('/')({
  loader: () => ({ icon }),
  component: () => <div css={{ color: 'red' }}>{icon}</div>,
})
`

  it('keeps the pragma in effect for JSX the loader and the component share', async () => {
    const route = await loadWithUntouched(sharedJsxRoute)
    // Whichever module holds the shared JSX compiles it with the pragma.
    const [expected, rendered] = await route.run<[string, string]>(
      `const control = ${untouched}
return [
  await renderComponent(() => control.loader().icon),
  await renderComponent(() => options.loader().icon),
]`,
    )
    expect(emotionStyled(expected)).toBe(true)
    expect(rendered).toBe(expected)
  })
})

/** The route module as the dev server serves it, once the route loaded. */
async function referenceModule(route: RouteApp) {
  const { modules } = await route.modules()
  return modules.reference!
}

// License comments stay in the route module when the splitter moves or
// removes the code below them (SPEC G12): minifiers keep legal
// comments in the modules that carry them, so the route module keeps the
// notice of the code it no longer holds. Copies in other modules and other
// orphaned comments are free. Source: #8504. The comment is the explicit
// text contract SPEC G12 names: read in the route module the page loads.
describe('the route module keeps the license comments of the route file', () => {
  it('leading the file', async () => {
    const legal = '/*! Example Corp. | MIT License */'
    const route = await loadRoute(
      `${legal}\n${head}export const Route = createFileRoute('/')({
  component: () => <p>page</p>,
})`,
    )
    // The splitter moved code away: the component loads lazily.
    expect(await route.isLazy('component')).toBe(true)
    expect(await referenceModule(route)).toContain(legal)
  })

  it.each([
    {
      name: 'above a component the splitter moves into its chunk',
      legal: '/** @license Example Corp. | MIT License */',
      route: (legal: string) => `${head}${legal}
function Page() {
  return <p>page</p>
}
export const Route = createFileRoute('/')({ component: Page })
`,
    },
    {
      name: 'above a declaration a deleted route option alone read',
      legal: '/* @preserve Example Corp. | MIT License */',
      route: (legal: string) => `${head}${legal}
const ssr = () => false
export const Route = createFileRoute('/')({
  ssr,
  component: () => <p>page</p>,
})
`,
      deleteNodes: ['ssr' as const],
    },
  ])('$name', async ({ legal, route, deleteNodes }) => {
    const loaded = await loadRoute(route(legal), { deleteNodes })
    expect(await referenceModule(loaded)).toContain(legal)
  })
})
