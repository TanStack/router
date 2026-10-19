// Fast-tier half of this suite. The real-project rows (a JSX transform that
// reads pragmas anywhere, React Refresh and solid-refresh pragmas in a page)
// are in integration/code-splitter-pragmas.test.ts.
import {
  captureConsole,
  expectDiagnostic,
} from '@tanstack/compiler-test-utils/diagnostics'
import { describe, expect, it } from 'vitest'
import {
  compileRouteModules,
  evaluateModule,
  head,
  loadRoute,
  renderComponent,
} from './regression-helpers'
import type { Stubs } from './lazy-tracking'

/**
 * The untouched route file evaluated through the project's real JSX
 * transform (Vite's, which reads leading pragmas only) with the real React
 * and the real `@emotion/react`: its route's options.
 */
async function untouchedOptions(code: string, stubs: Stubs = {}) {
  const { Route } = (await evaluateModule(code, stubs)) as Record<string, any>
  return Route.options as Record<string, any>
}

/**
 * The route file's component rendered as the untouched file renders it
 * (`untouchedOptions`), server-rendered.
 */
async function renderUntouched(code: string, stubs: Stubs = {}) {
  return renderComponent((await untouchedOptions(code, stubs)).component)
}

/**
 * Whether Emotion styled the markup: rendered on the server, Emotion
 * inlines a style element in front of the element it styles; the project's
 * default JSX runtime leaves a `css` prop as a plain attribute instead.
 */
const emotionStyled = (html: string) => /<style\b/.test(html)

/**
 * Loads the route (splitting it) and asserts that its component renders
 * what the untouched file renders, through the same real transform and
 * renderer: the JSX runtime decision of the file (its pragmas, leading or
 * not, as the project's transform reads them) holds in every module holding
 * its JSX (SPEC J2.16). A component left unsplit is accepted with a warning
 * naming the file and the option (D-04, J2.8). Returns the rendering.
 */
async function expectRendersLikeUntouched(
  code: string,
  options: Parameters<typeof loadRoute>[1] = {},
) {
  const untouched = await renderUntouched(code, options.stubs)
  const { result: route, diagnostics } = await captureConsole(() =>
    loadRoute(code, options),
  )
  if (!(await route.isLazy('component'))) {
    expectDiagnostic(diagnostics, {
      severity: 'warning',
      file: route.ids.reference!,
      names: ['component'],
    })
  }
  expect(await route.render('component')).toBe(untouched)
  return untouched
}

// JSX pragmas apply per module: the code splitter runs before the bundler's
// JSX transform, which then runs on each split module separately, so a module
// without the pragma compiles its JSX with the project default runtime (e.g.
// `css` props are no longer handled by Emotion).
describe('split modules keep file-level JSX pragmas', () => {
  const styledRoute = (
    header: string,
  ) => `${header}export const Route = createFileRoute('/pragma')({
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
export const Route = createFileRoute('/pragma')({
  component: () => <div css={{ color: 'red' }}>{jsx('b', null, 'styled')}</div>,
})
`)
    expect(emotionStyled(rendered)).toBe(true)
  })

  const sharedJsxRoute = `/** @jsxImportSource @emotion/react */
${head}const icon = <svg css={{ width: 1 }} />
export const Route = createFileRoute('/pragma')({
  loader: () => ({ icon }),
  component: () => <div css={{ color: 'red' }}>{icon}</div>,
})
`

  it('keeps the pragma in effect for JSX the loader and the component share', async () => {
    const untouched = await untouchedOptions(sharedJsxRoute)
    const untouchedIcon = await renderComponent(() => untouched.loader().icon)
    expect(emotionStyled(untouchedIcon)).toBe(true)
    const route = await loadRoute(sharedJsxRoute)
    // Whichever module holds the shared JSX compiles it with the pragma.
    expect(await renderComponent(() => route.options.loader().icon)).toBe(
      untouchedIcon,
    )
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
// known-bugs-code-splitter.test.ts, "classic JSX pragmas".)
describe('split modules keep the classic JSX factories their JSX compiles to', () => {
  /**
   * Classic JSX factory rendering intrinsic elements to text (`p(text)`),
   * which React renders as is: JSX compiled with React's runtime instead
   * renders `<p>text</p>`.
   */
  const render = (type: unknown, _props: unknown, ...children: Array<any>) => {
    const text = children.flat(Infinity).join('')
    if (typeof type === 'function') {
      return type()
    }
    return type === Fragment ? text : `${String(type)}(${text})`
  }
  const Fragment = Symbol('Fragment')
  const stubs = { '@emotion/react': { jsx: render, Frag: Fragment } }
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
      const route = await loadRoute(
        `${classicHead}function Page() {
  return jsx('div', null, 'page')
}
export const Route = createFileRoute('/')({
  component: Page,
  pendingComponent: () => <p>pending</p>,
})`,
        { stubs },
      )
      expect([
        await route.render('pendingComponent'),
        await route.render('component'),
        await route.isLazy('pendingComponent'),
      ]).toEqual(['p(pending)', 'div(page)', false])
    },
  )
})

// License comments stay in the route module when the splitter moves or
// removes the code below them (R-14, SPEC G12): minifiers keep legal
// comments in the modules that carry them, so the route module keeps the
// notice of the code it no longer holds. Copies in other modules and other
// orphaned comments are free. Source: #8504.
describe('the route module keeps the license comments of the route file', () => {
  it('leading the file', () => {
    const legal = '/*! Example Corp. | MIT License */'
    const { modules } = compileRouteModules(
      `${legal}\n${head}export const Route = createFileRoute('/')({
  component: () => <p>page</p>,
})`,
    )
    expect(Object.keys(modules).length).toBeGreaterThan(1)
    expect(modules.reference).toContain(legal)
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
  ])('$name', ({ legal, route, deleteNodes }) => {
    const { modules } = compileRouteModules(route(legal), { deleteNodes })
    expect(modules.reference).toContain(legal)
  })
})
