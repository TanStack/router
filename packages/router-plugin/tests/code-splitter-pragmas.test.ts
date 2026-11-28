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
import {
  expectMapsTo,
  positionAt,
  tokenOffsets,
} from '@tanstack/compiler-test-utils/source-maps'
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
async function expectRendersLikeUntouched(
  code: string,
  options: RouteAppOptions = {},
) {
  const route = await loadWithUntouched(code, options)
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
    // a license notice and the pragma in one comment: the notice stays in
    // the route module (SPEC G12), the pragma takes effect in the chunk too.
    // Source: whole-PR review C5-01 (Astra C5 #3)
    [
      'inside a license comment',
      `/**\n * @license MIT\n * @jsxImportSource @emotion/react\n */\n${head}`,
    ],
    // the pragma's value touching the comment's end (`react*/`): the pragma
    // is the comment's value, without its delimiters.
    // Source: emit prototype review (Fable 1, Astra 1, Gemini 2)
    [
      'in a license comment ending on its value',
      `/*! @jsxImportSource @emotion/react*/\n${head}`,
    ],
  ])('keeps @jsxImportSource %s in effect', async (_, header) => {
    const rendered = await expectRendersLikeUntouched(styledRoute(header))
    expect(emotionStyled(rendered)).toBe(true)
  })

  // SPEC J2.16: what a pragma written after the imports means is the
  // project's JSX transform's decision. Vite's (Oxc) reads leading pragmas
  // only, so the untouched file renders with React's runtime, and so must
  // the split component: the pragma must not become effective in a chunk.
  // A project whose transform reads pragmas anywhere:
  // integration/code-splitter-pragmas.test.ts.
  // Bug: the chunk of the split component starts with the pragma comment
  // (the imports above it in the route file are gone from the chunk), so
  // Oxc reads it there: the split component renders with Emotion's runtime
  // where the untouched file renders with React's.
  // Impact: with Vite 8, a `css` prop that the untouched route ignored is
  // styled once the component is split (or the reverse once the user
  // relies on the unsplit behaviour): the route renders differently split.
  // A pragma name whose value is on the next line is no pragma to the
  // project's transform: the untouched file uses the default runtime, and
  // so does the split component (the license notice stays in the route
  // module). Source: emit review re-check (Astra 1, Gemini 1)
  it.each([
    [
      'its value on the next line',
      `/**\n * @license MIT\n * @jsxImportSource\n * @emotion/react\n */\n${head}`,
    ],
    [
      'no value on its line',
      `/**\n * @license MIT\n * Note @jsx\n * Copyright\n */\n${head}`,
    ],
  ])(
    'keeps a pragma name in a license comment with %s as ineffective as in the untouched file',
    async (_, header) => {
      const rendered = await expectRendersLikeUntouched(styledRoute(header))
      expect(emotionStyled(rendered)).toBe(false)
    },
  )

  // A separator the project's transform does not take for one (Oxc: a
  // non-breaking space, a vertical tab, a form feed): the untouched file
  // uses the default runtime, and so does the split component, which gets
  // the comment as written. Source: emit review re-check (Astra, cbe1503a9e)
  it.each([
    ['a non-breaking space', '\u00a0'],
    ['a vertical tab', '\v'],
    ['a form feed', '\f'],
  ])(
    'keeps a pragma in a license comment separated from its value by %s as ineffective as in the untouched file',
    async (_, separator) => {
      const rendered = await expectRendersLikeUntouched(
        styledRoute(
          `/**\n * @license MIT\n * @jsxImportSource${separator}@emotion/react\n */\n${head}`,
        ),
      )
      expect(emotionStyled(rendered)).toBe(false)
    },
  )

  // A pragma comment is copied as written, whatever the project's transform
  // makes of it: a value on the next line is no pragma to Oxc (the
  // untouched file and the chunk use the default runtime) but is one to
  // TypeScript, which reads the chunk's copy as it reads the source.
  // Source: emit review re-check (Fable N1, cbe1503a9e)
  it('copies a pragma comment with its value on the next line into the split component as written', async () => {
    const comment = '/* @jsxImportSource\n@emotion/react */'
    const route = await loadWithUntouched(styledRoute(`${comment}\n${head}`))
    expect(
      (await route.loadedBy('component')).some((code) =>
        code.includes(comment),
      ),
    ).toBe(true)
    const [rendered, expected] = await route.run<[string, string]>(
      `return [await render('component'), await renderComponent(${untouched}.component)]`,
    )
    expect(rendered).toBe(expected)
  })

  it('keeps a @jsxImportSource written after the imports as ineffective as in the untouched file (leading-pragma project)', async () => {
    const rendered = await expectRendersLikeUntouched(
      styledRoute(`${head}/** @jsxImportSource @emotion/react */\n`),
    )
    expect(emotionStyled(rendered)).toBe(false)
  })
  // A split chunk with HMR carries the file's `@refresh` pragmas (SPEC
  // J2.16), the pragma alone: a comment holding it and a JSX pragma written
  // after the imports keeps that JSX pragma ineffective in the chunk.
  it('keeps a @jsxImportSource written after the imports in a @refresh comment as ineffective, with HMR', async () => {
    const rendered = await expectRendersLikeUntouched(
      styledRoute(
        `${head}/**\n * @refresh reset\n * @jsxImportSource @emotion/react\n */\n`,
      ),
      { hmr: true },
    )
    expect(emotionStyled(rendered)).toBe(false)
  })

  // The chunk's copy of a `@refresh` comment holding a lone CR (a line
  // terminator, SPEC G6) keeps the chunk's map on the user's lines: the
  // component's text maps to where the route file has it.
  // Source: whole-PR review C5-05 (Astra C5 #5)
  it('maps the split component to its source line after a copied @refresh comment holding a lone CR, with HMR', async () => {
    const code = `${head}/* @refresh reset\r leave this comment */
export const Route = createFileRoute('/')({
  component: () => <p>marker</p>,
})
`
    const route = await loadRoute(code, { hmr: true })
    const { ids } = await route.modules()
    const chunk = ids['lazy component']
    expect(chunk, 'the split component module').toBeDefined()
    const served =
      await route.host.dev.vite.environments.client.transformRequest(chunk!)
    const [generated] = tokenOffsets(served!.code, { string: 'marker' })
    expect(generated, 'the component text in the chunk').toBeDefined()
    const [original] = tokenOffsets(code, { string: 'marker' })
    expectMapsTo(served!.map as never, positionAt(served!.code, generated!), {
      file: route.host.file('route.tsx'),
      mapUrl: route.host.file('route.tsx'),
      ...positionAt(code, original!),
    })
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

  // Bug: a split chunk that imports a binding it shares with the route
  // module gets that import inserted above the file's leading pragma
  // comment, and Oxc (Vite 8's JSX transform) only reads pragmas that lead
  // the file.
  // Impact: with Vite 8, the split component compiles with the default JSX
  // runtime as soon as it shares a binding with the loader: `css` props
  // are ignored and the component renders unstyled.
  it('keeps the pragma in effect in every module that contains JSX', async () => {
    const rendered = await expectRendersLikeUntouched(sharedJsxRoute)
    expect(emotionStyled(rendered)).toBe(true)
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
    // C2-05 (whole-PR review)
    ...[
      '/*! Example Corp. | MIT License */',
      '// @license Example Corp. | MIT License',
    ].map((legal) => ({
      name: `between the declarators of a list the splitter splits (${legal.slice(0, 2)})`,
      legal,
      route: (legal: string) => `${head}const version = 1, ${legal}
  Page = () => <p>page</p>
export { version }
export const Route = createFileRoute('/')({ component: Page })
`,
      deleteNodes: undefined,
    })),
    {
      // the whole list moves (whole-PR review of the declarations lane)
      name: 'between the declarators of a list the splitter moves whole',
      legal: '/*! Example Corp. | MIT License */',
      route: (legal: string) => `${head}const label = 'page', ${legal}
  Page = () => <p>{label}</p>
export const Route = createFileRoute('/')({ component: Page })
`,
      deleteNodes: undefined,
    },
    // a license comment ending the line of a moved declaration is written
    // for the code after it
    ...[
      '// @license Example Corp. | MIT License',
      '/*! Example Corp. | MIT License */',
    ].map((legal) => ({
      name: `ending the line of a component the splitter moves (${legal.slice(0, 2)})`,
      legal,
      route: (
        legal: string,
      ) => `${head}function Page() { return <p>page</p> } ${legal}
export const version = 1
export const Route = createFileRoute('/')({ component: Page })
`,
      deleteNodes: undefined,
    })),
  ])('$name', async ({ legal, route, deleteNodes }) => {
    const loaded = await loadRoute(route(legal), { deleteNodes })
    expect(await referenceModule(loaded)).toContain(legal)
  })
})
