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
 * naming the file and the option (D-04, J2.8). Returns the rendering.
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

  // D-04 (J2.16): what a pragma written after the imports means is the
  // project's JSX transform's decision. Vite's (Oxc) reads leading pragmas
  // only, so the untouched file renders with React's runtime, and so must
  // the split component: the pragma must not become effective in a chunk.
  // A project whose transform reads pragmas anywhere:
  // integration/code-splitter-pragmas.test.ts.
  // Bug: the chunk of the split component starts with the pragma comment
  // (the imports above it in the route file are gone from the chunk), so
  // Oxc reads it there: the split component renders with Emotion's runtime
  // where the untouched file renders with React's.
  // Source: V1 split F12 (D-04 ruled 2026-10-18).
  // Impact: with Vite 8, a `css` prop that the untouched route ignored is
  // styled once the component is split (or the reverse once the user
  // relies on the unsplit behaviour): the route renders differently split.
  it.fails(
    'keeps a @jsxImportSource written after the imports as ineffective as in the untouched file (leading-pragma project)',
    async () => {
      const rendered = await expectRendersLikeUntouched(
        styledRoute(`${head}/** @jsxImportSource @emotion/react */\n`),
      )
      expect(emotionStyled(rendered)).toBe(false)
    },
  )

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

  // Bug: a split chunk that imports a binding it shares with the route
  // module gets that import inserted above the file's leading pragma
  // comment, and Oxc (Vite 8's JSX transform) only reads pragmas that lead
  // the file.
  // Impact: with Vite 8, the split component compiles with the default JSX
  // runtime as soon as it shares a binding with the loader: `css` props
  // are ignored and the component renders unstyled.
  it.fails(
    'keeps the pragma in effect in every module that contains JSX',
    async () => {
      const rendered = await expectRendersLikeUntouched(sharedJsxRoute)
      expect(emotionStyled(rendered)).toBe(true)
    },
  )
})

// With the classic runtime, the JSX of each module compiles to calls of the
// factory its pragmas name, so the factory import must stay wherever JSX
// does. Source: #8504. (A chunk whose only use of the factory is its JSX, or
// that imports it from the route module: pinned in
// known-bugs-code-splitter.test.ts, "classic JSX pragmas".) The factory is
// the real `@emotion/react` `jsx`, rendered by the real React: JSX compiled
// with the project's default runtime instead leaves a `css` prop unstyled.
describe('split modules keep the classic JSX factories their JSX compiles to', () => {
  const classicHead = `/** @jsxRuntime classic */
/** @jsx jsx */
${head}import { jsx } from '@emotion/react'
`

  // Bug: the route module the code splitter emits starts with the code it
  // adds (the split component's importer and the import of the router's
  // lazy helper), above the file's leading pragma comments, and drops the
  // factory import once the route module's only use of it is its JSX
  // (dead-code elimination does not count a classic JSX pragma as a use of
  // its factory: same root cause as the "classic JSX pragmas" pins of
  // known-bugs-code-splitter.test.ts). Oxc (Vite 8) only reads leading
  // pragmas, so the JSX left in the route module compiles with the
  // project's default runtime. Found when the in-process JSX stand-in (which
  // compiled every module with its own classic factory) was replaced by
  // React's real JSX transform.
  // Source: #8504 (this test passed with the stand-in).
  // Impact: with Vite 8, JSX that stays in the route module of a file with
  // JSX pragmas (a pendingComponent, JSX shared with the loader) ignores them
  // as soon as an option is split: Emotion's `css` props are dropped, and a
  // classic factory would throw "jsx is not defined" once the pragma is read.
  it.fails(
    'in the route module, when the code calling the factory is split',
    async () => {
      const code = `${classicHead}function Page() {
  return jsx('div', { css: { color: 'blue' } }, 'page')
}
export const Route = createFileRoute('/')({
  component: Page,
  pendingComponent: () => <p css={{ color: 'red' }}>pending</p>,
})`
      const route = await loadWithUntouched(code)
      const [expected, rendered] = await route.run<
        [Array<string>, Array<string>]
      >(`const control = ${untouched}
return [
  [await renderComponent(control.pendingComponent), await renderComponent(control.component)],
  [await render('pendingComponent'), await render('component')],
]`)
      expect(expected.map(emotionStyled)).toEqual([true, true])
      expect(rendered).toEqual(expected)
    },
  )
})

/** The route module as the dev server serves it, once the route loaded. */
async function referenceModule(route: RouteApp) {
  const { modules } = await route.modules()
  return modules.reference!
}

// License comments stay in the route module when the splitter moves or
// removes the code below them (R-14, SPEC G12): minifiers keep legal
// comments in the modules that carry them, so the route module keeps the
// notice of the code it no longer holds. Copies in other modules and other
// orphaned comments are free. Source: #8504. The comment is the explicit
// text contract R-14 names (N11): read in the route module the page loads.
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
