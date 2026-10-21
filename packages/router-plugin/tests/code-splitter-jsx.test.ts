/**
 * JSX of split route options (SPEC J2.4, G1): a component the loader's and
 * the component's chunks share stays one component, and JSX text survives
 * splitting. Routes load in a real browser page (`./route-app`).
 */
import { expect, it } from 'vitest'
import { expectValidModules, head, loadRoute } from './route-app'

/**
 * Loads a route whose split loader returns the component `name` and whose
 * split component renders it as `<name />`; returns what the component
 * renders, and whether the component it rendered is the one the loader
 * returns.
 */
async function renderSharedJsxComponent(name: string) {
  const route = await loadRoute(
    `import { createFileRoute } from '@tanstack/react-router'
import { see } from './see'
const ${name} = () => {
  see(${name})
  return 'hello'
}
export const Route = createFileRoute('/widget')({
  codeSplitGroupings: [['loader'], ['component']],
  loader: () => ${name},
  component: () => <${name} />,
})`,
    {
      routeId: '/widget',
      files: {
        'see.ts': `export const rendered: Array<unknown> = []
export const see = (value: unknown) => {
  rendered.push(value)
}
`,
      },
    },
  )
  await expectValidModules(route)
  expect([
    await route.isLazy('loader'),
    await route.isLazy('component'),
  ]).toEqual([true, true])
  return route.run<[string, boolean]>(`const html = await render('component')
const loaded = await (await load('loader'))()
const { rendered } = await app('see.ts')
return [html, rendered.length === 1 && rendered[0] === loaded]`)
}

// JSX names a component by a tag that does not start with an ASCII lowercase
// letter; the loader's chunk and the component's chunk share the one
// component. Source: main code-splitter tests (Widget, _Widget, $Widget);
// #8504 (non-ASCII names).
it.each(['Widget', 'ÉWidget'])(
  'gives separate loader and component chunks the one JSX component %s',
  async (name) => {
    expect(await renderSharedJsxComponent(name)).toEqual(['hello', true])
  },
)

// Bug: the identifier collection that decides what split options share
// takes a JSX tag whose first character equals its lowercase form for an
// intrinsic element (router-utils compiler-helpers.ts, `first ===
// first.toLowerCase()`), which holds for `_`, `$` and non-ASCII lowercase
// letters, whereas JSX only treats tags starting with an ASCII lowercase
// letter as intrinsic. So the component chunk does not count `<_Widget />`
// as a read of `_Widget` and declares its own copy.
// Source: the shared-JSX-component test of main, which never checked
// identity (round-2 rubric item 8).
// Impact: a component the loader and a split component share, named with a
// leading `_` or `$` or a non-ASCII lowercase letter, exists twice: identity
// checks and module state of the component differ between the chunks.
it.fails.each(['_Widget', '$Widget', 'éWidget'])(
  'gives separate loader and component chunks the one JSX component %s',
  async (name) => {
    expect(await renderSharedJsxComponent(name)).toEqual(['hello', true])
  },
)

// JSX text right after a closing fragment that starts with non-ASCII
// punctuation (an em dash). Source: #8504 (differential fuzzing; a guard
// against a parser bug, yuku-toolchain/yuku#260).
it('splits a component whose JSX text after a fragment starts with an em dash', async () => {
  const route =
    await loadRoute(`${head}export const Route = createFileRoute('/')({
  component: () => <p><>first</> — second</p>,
})
`)
  await expectValidModules(route)
  expect(await route.isLazy('component')).toBe(true)
  expect(await route.run(`return render('component')`)).toBe(
    '<p>first — second</p>',
  )
})
