/**
 * The forms a `<Hydrate>` boundary is written in, and what each environment
 * makes of it: the server strips the client-only `fallback` however it is
 * passed, `split={false}` keeps the children in place, children that cannot
 * be split are rejected clearly, nested boundaries hydrate with the ids the
 * server renders, and only the `Hydrate` of a `@tanstack/*-start` package is
 * a boundary.
 *
 * Every output is rendered with the real React, `@tanstack/react-router` and
 * Start's real `Hydrate` and strategies (`render.ts`) and compared with the
 * uncompiled source and across environments. What only a browser observes
 * (the client receiving the fallback, `prefetch`, `onHydrated`, the function
 * form of `when` running on the client only) is checked by real pages.
 */
import { afterEach, beforeAll, describe, expect, test } from 'vitest'
import {
  captureThrow,
  diagnosticPosition,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { createModuleGraph } from '@tanstack/compiler-test-utils/module-linker'
import { getModuleErrors } from '@tanstack/compiler-test-utils/validate-module'
import {
  compileHydrate,
  expectClientRendersLikeServer,
  expectCompileError,
  expectRendersLikeSource,
  importSources,
  loadChunk,
  renderClient,
  renderServer,
  renderSource,
  startPackage,
  withoutHydrationIds,
  withoutQuotedSource,
} from './regression-helpers'
import { packagesDir } from './render'
import type { ModuleStub, RenderOptions } from './regression-helpers'

const head = `import { Hydrate } from '@tanstack/react-start'
import { load } from '@tanstack/react-start/hydration'
`

/**
 * The server output of `code` renders the markup the uncompiled source
 * renders (hydration ids blanked, `withoutHydrationIds`). Returns the server
 * render.
 */
async function expectServerRendersLikeSource(
  code: string,
  options: RenderOptions = {},
) {
  const source = await renderSource(code, options)
  const server = await renderServer(code, options)
  expect(withoutHydrationIds(server.html)).toBe(
    withoutHydrationIds(source.html),
  )
  return server
}

describe('the server strips the client-only fallback, and only it', () => {
  // Source: hydrate-when-transform.test.ts "strips Hydrate fallback from the
  // server transform", "strips fallback from a parenthesized spread",
  // "strips a statically computed fallback property from server output",
  // "resolves spread props declared after their containing function";
  // hydrateWhen ObjectFallback and SplitFalse fixtures.
  const forms = [
    {
      name: 'a direct fallback',
      code: `export function Page() {
  return <Hydrate when={visible()} fallback={<p>fallback-marker</p>}><p>child</p></Hydrate>
}`,
    },
    {
      name: 'a direct fallback with split={false}',
      code: `export function Page() {
  return <Hydrate when={visible()} split={false} fallback={<p>fallback-marker</p>}><p>child</p></Hydrate>
}`,
    },
    {
      name: 'a direct fallback next to prefetch and onHydrated',
      code: `export function Page() {
  return <Hydrate when={visible()} prefetch={() => {}} fallback={<p>fallback-marker</p>} onHydrated={() => 'hydrated'}><p>child</p></Hydrate>
}`,
    },
    {
      name: 'an inline spread',
      code: `export function Page() {
  return <Hydrate {...{ when: visible(), fallback: <p>fallback-marker</p> }}><p>child</p></Hydrate>
}`,
    },
    {
      name: 'a parenthesized inline spread',
      code: `export function Page() {
  return <Hydrate {...({ when: visible(), fallback: <p>fallback-marker</p> })}><p>child</p></Hydrate>
}`,
    },
    {
      name: 'a spread used once, declared before the component',
      code: `const props = { when: visible(), fallback: <p>fallback-marker</p> }
export function Page() {
  return <Hydrate {...props}><p>child</p></Hydrate>
}`,
    },
    {
      name: 'a spread used once, declared after the component',
      code: `export function Page() {
  return <Hydrate {...props}><p>child</p></Hydrate>
}
const props = { when: visible(), fallback: <p>fallback-marker</p> }`,
    },
    {
      name: 'a parenthesized spread used once',
      code: `const props = ({ when: visible(), fallback: <p>fallback-marker</p> })
export function Page() {
  return <Hydrate {...(props)}><p>child</p></Hydrate>
}`,
    },
    {
      // Source: hydrateWhenSplitFalse.tsx fixture (main)
      name: 'a module-level element',
      moduleLevel: true,
      code: `const fallback = <p>fallback-marker</p>
export function Page() {
  return <Hydrate when={visible()} fallback={fallback}><p>child</p></Hydrate>
}`,
    },
    {
      name: 'a module-level element with split={false}',
      moduleLevel: true,
      code: `const fallback = <p>fallback-marker</p>
export function Page() {
  return <Hydrate when={visible()} split={false} fallback={fallback}><p>child</p></Hydrate>
}`,
    },
    {
      name: 'a computed fallback key',
      code: `export function Page() {
  return <Hydrate {...{ when: visible(), ['fallback']: <p>fallback-marker</p> }}><p>child</p></Hydrate>
}`,
    },
    {
      name: 'an inline spread with quoted keys',
      code: `export function Page() {
  return <Hydrate {...{ 'when': visible(), 'fallback': <p>fallback-marker</p> }}><p>child</p></Hydrate>
}`,
    },
    {
      name: 'a spread used once with split={false}',
      code: `const props = { when: visible(), fallback: <p>fallback-marker</p> }
export function Page() {
  return <Hydrate split={false} {...props}><p>child</p></Hydrate>
}`,
    },
  ]

  /** Every row passes `when={visible()}`, through a prop or a spread. */
  const formsHead = `${head}import { visible } from '@tanstack/react-start/hydration'
`

  // A module-level element the boundary reads stays declared or not: the
  // prop is removed, and what is left of the module is dead code (SPEC
  // §5.9; FIX-PLAN HYD-11).
  test.each(forms)(
    'server: $name is removed',
    async ({ code, moduleLevel }) => {
      const server = await expectServerRendersLikeSource(`${formsHead}${code}`)
      expect(server.html).toContain('<p>child</p>')
      if (!moduleLevel) {
        expect(server.parent).not.toContain('fallback-marker')
      }
    },
  )

  // That the client boundary receives the fallback (and `prefetch`,
  // `onHydrated`) is checked by real pages.
  test.each(forms)(
    'client: a boundary with $name renders like the server',
    async ({ code }) => {
      const { client } = await expectClientRendersLikeServer(
        `${formsHead}${code}`,
        { split: !code.includes('split={false}') },
      )
      expect(client.html).toContain('<p>child</p>')
    },
  )

  // A client-only module the fallback renders (e.g. a spinner reading browser
  // APIs) is not loaded by the server module, however the fallback reaches
  // it; module bindings the children read stay.
  test.each([
    {
      name: 'an imported component',
      code: `import { Spinner } from './client-spinner'
export function Page() { return <Hydrate when={load()} fallback={<Spinner />}><p>child</p></Hydrate> }`,
    },
    {
      name: 'a const component rendering an import',
      code: `import { Spinner } from './client-spinner'
const Fallback = () => <Spinner />
export function Page() { return <Hydrate when={load()} fallback={<Fallback />}><p>child</p></Hydrate> }`,
    },
    {
      name: 'a function component rendering an import',
      code: `import { Spinner } from './client-spinner'
function Fallback() { return <Spinner /> }
export function Page() { return <Hydrate when={load()} fallback={<Fallback />}><p>child</p></Hydrate> }`,
    },
    {
      name: 'a class rendering an import',
      code: `import { Spinner } from './client-spinner'
class Fallback { render() { return <Spinner /> } }
export function Page() { return <Hydrate when={load()} fallback={new Fallback().render()}><p>child</p></Hydrate> }`,
    },
    {
      name: 'a binding in an inline spread',
      code: `import { Spinner } from './client-spinner'
const spinner = <Spinner />
export function Page() { return <Hydrate when={load()} {...{ fallback: spinner }}><p>child</p></Hydrate> }`,
    },
    {
      name: 'an element in an inline spread',
      code: `import { Spinner } from './client-spinner'
export function Page() { return <Hydrate when={load()} {...{ fallback: <Spinner /> }}><p>child</p></Hydrate> }`,
    },
    {
      name: 'a destructured namespace import',
      code: `import * as lib from './client-spinner'
const { Spinner } = lib
export function Page() { return <Hydrate when={load()} fallback={<Spinner />}><p>child</p></Hydrate> }`,
    },
    {
      name: 'a declarator next to one the children read',
      code: `import { Spinner } from './client-spinner'
const label = 'child', spinner = <Spinner />
export function Page() { return <Hydrate when={load()} fallback={spinner}><p>{label}</p></Hydrate> }`,
    },
    {
      name: 'a spread used once with split={false}',
      code: `import { Spinner } from './client-spinner'
const opts = { fallback: <Spinner /> }
export function Page() { return <Hydrate when={load()} split={false} {...opts}><p>child</p></Hydrate> }`,
    },
  ])(
    'server: a fallback through $name does not load its client-only module',
    async ({ code }) => {
      const server = await expectServerRendersLikeSource(`${head}${code}`, {
        files: {
          './client-spinner': `export const Spinner = () => <i>spinner</i>`,
        },
      })
      expect(server.html).toContain('<p>child</p>')
      expect(server.graph.requested).not.toContain(
        '/test/src/client-spinner.tsx',
      )
    },
  )

  test('server: a module-level destructuring read by the fallback and the children keeps the children binding', async () => {
    const server = await expectServerRendersLikeSource(
      `${head}const { a, b } = { a: 'A', b: 'B' }
export function Page() {
  return <Hydrate when={load()} fallback={<p>{a}{b}</p>}><p>{b}</p></Hydrate>
}`,
    )
    expect(server.html).toContain('<p>B</p>')
  })

  // Whatever expression `when` is, both environments pass its value to the
  // boundary (the server strips the fallback next to it): the outputs render
  // the boundary the strategy renders in the source. That the function form
  // runs on the client only is checked by real pages.
  test.each([
    { name: 'a strategy call', when: 'idle()' },
    {
      name: 'a strategy call with options',
      when: `interaction({ events: 'focusin' })`,
    },
    { name: 'a prop', when: 'props.when' },
    {
      name: 'a local',
      setup: `const strategy = media('(min-width: 1px)')\n  `,
      when: 'strategy',
    },
    {
      name: 'a conditional',
      when: 'props.eager ? load() : visible()',
    },
    {
      name: 'a function',
      when: `() => idle()`,
    },
  ])(
    'when as $name reaches the boundary in both environments',
    async ({ setup = '', when }) => {
      const { media } = await startPackage('@tanstack/react-start/hydration')
      const code = `${head}import { idle, interaction, media, visible } from '@tanstack/react-start/hydration'
export function Page(props) {
  ${setup}return <Hydrate when={${when}} fallback={<p>fallback-marker</p>}><p>child</p></Hydrate>
}`
      const { server, client } = await expectRendersLikeSource(code, {
        props: { when: media('(max-width: 2px)'), eager: false },
      })
      expect(client.html).toContain('<p>child</p>')
      expect(server.parent).not.toContain('fallback-marker')
    },
  )
})

/**
 * A page whose boundary, with the given `split` attribute (`''`: none), has
 * `children`; `setup` comes before the component.
 */
const childrenPage = (
  children: string,
  split = '',
  setup = '',
) => `${head}import { idle } from '@tanstack/react-start/hydration'
import { useThing, use3D } from './hooks'
${setup}export function Page({ flag }: { flag?: boolean }) {
  return <Hydrate when={idle()}${split}>${children}</Hydrate>
}`

/** A class component whose boundary reads `this` or `super`. */
const classPage = (
  read: 'this' | 'super',
  split = '',
) => `${head}import { idle } from '@tanstack/react-start/hydration'
class Base {
  get title() {
    return 'super'
  }
}
export class Page extends Base {
  title2 = 'this'
  render() {
    return (
      <Hydrate when={idle()}${split}>
        <p>{${read === 'this' ? 'this.title2' : 'super.title'}}</p>
      </Hydrate>
    )
  }
}`

/** A real hook whose value depends on the component that calls it. */
const hooks = {
  './hooks': `import { useId } from 'react'
export const useThing = () => useId()
export const use3D = () => useId()`,
}

/**
 * The documented fixes of children that cannot be split (deferred-hydration
 * docs, "These patterns cannot be split"): `split={false}` or moving the UI
 * into a (child, function) component.
 */
const documentedFix =
  /split=\{false\}|\b(child|function|separate|own|named) components?\b/i

/**
 * The client compilation, which extracts the children, rejects `code` with
 * an error (SPEC J5.5) naming the unsafe pattern (`pattern`, matched in the
 * message without the lines quoting `code`, `withoutQuotedSource`) and a
 * documented fix (`documentedFix`),
 * and reporting a line of the boundary (the frame marks it, or a
 * position). Wording and frame layout are free (SPEC §5.7). The file is
 * named by the bundler that runs the compiler (hydrate-build.test.ts). The
 * server compilation renders the children in place: rejecting them there
 * is neither required nor forbidden.
 */
async function expectExtractionRejected(code: string, pattern: RegExp) {
  const diagnostics = await captureThrow(() => compileHydrate('client', code))
  const message = withoutQuotedSource(diagnostics[0]!.text, code)
  expect(message).toMatch(pattern)
  expect(message).toMatch(documentedFix)
  const first = diagnosticPosition(code, '<Hydrate').line
  const last = diagnosticPosition(code, '</Hydrate>').line
  const lines = Array.from(
    { length: last - first + 1 },
    (_, index) => first + index,
  )
  expect(
    lines.filter(
      (line) =>
        findDiagnostics(diagnostics, {
          severity: 'error',
          position: { line },
          source: code,
        }).length > 0,
    ),
    `a line of the boundary (${first}-${last})`,
  ).not.toEqual([])
}

/** The unsafe children of SPEC J5.5 and what the rejection must name. */
const unsafeChildren = [
  {
    name: 'a function child (an arrow)',
    code: (split = '') => childrenPage('{() => <p>child</p>}', split),
    pattern: /function/i,
  },
  {
    name: 'a function child (a parenthesized arrow)',
    code: (split = '') => childrenPage('{(() => <p>child</p>)}', split),
    pattern: /function/i,
  },
  {
    name: 'a function child (a function expression)',
    code: (split = '') =>
      childrenPage('{function () { return <p>child</p> }}', split),
    pattern: /function/i,
  },
  {
    name: 'a hook call',
    code: (split = '') => childrenPage('<p>{useThing()}</p>', split),
    pattern: /\bhooks?\b/i,
  },
  {
    // Source: V4 red-astra-r2/13; digit-bearing hook names follow React's convention.
    name: 'a hook call named use3D',
    code: (split = '') => childrenPage('<p>{use3D()}</p>', split),
    pattern: /\bhooks?\b/i,
  },
  {
    name: 'a parenthesized hook call',
    code: (split = '') => childrenPage('<p>{(useThing)()}</p>', split),
    pattern: /\bhooks?\b/i,
  },
]

describe('children that cannot be split', () => {
  // Source: hydrate-when-transform.test.ts "rejects function-as-children
  // unless the boundary opts out of splitting", "rejects hook calls that
  // would be moved into an extracted component", "rejects parenthesized
  // unsafe extraction"; hydrateWhen FunctionChild and HookCall error
  // fixtures; FIX-PLAN HYD-07.
  test.each(unsafeChildren)(
    'client: $name is rejected with the fix',
    async ({ code, pattern }) => {
      await expectExtractionRejected(code(), pattern)
    },
  )

  // Only the literal `split={false}` opts out (docs): a dynamic `split`
  // extracts, so it rejects the same children.
  // Source: FIX-PLAN HYD-07 (dynamic-split rows)
  test.each(unsafeChildren)(
    'client: $name with a dynamic split={flag} is rejected with the fix',
    async ({ code, pattern }) => {
      await expectExtractionRejected(code(' split={flag}'), pattern)
    },
  )

  // With the literal `split={false}` the compiler neither extracts nor
  // rejects the children (SPEC J5.5): every output renders like the
  // uncompiled source (what React makes of a function child is the
  // framework's business) and nothing loads lazily.
  // Source: hydrate-when-transform.test.ts "respects parenthesized
  // split={false}"; hydrateWhen SplitFalseFunctionChild fixture; FIX-PLAN
  // HYD-07 (literal-false controls)
  test.each([
    ...unsafeChildren.map(({ name, code }) => ({
      name,
      code: code(' split={false}'),
      render: undefined,
    })),
    {
      name: 'a function child with a parenthesized false',
      code: childrenPage('{() => <p>child</p>}', ' split={(false)}'),
      render: undefined,
    },
    {
      name: 'a read of this',
      code: classPage('this', ' split={false}'),
      render: (module: Record<string, any>) => new module.Page().render(),
    },
    {
      name: 'a read of super',
      code: classPage('super', ' split={false}'),
      render: (module: Record<string, any>) => new module.Page().render(),
    },
  ])(
    '$name with split={false} stays in place in both environments',
    async ({ code, render }) => {
      const { client } = await expectRendersLikeSource(code, {
        files: hooks,
        render,
        split: false,
      })
      expect(client.loadedChunks).toEqual([])
      expect(client.lazy).toEqual([])
    },
  )

  // The props of the boundary itself are not its children: they render in
  // the parent on both sides, so a hook call there does not stop the split.
  test('a hook call in the props of the boundary runs in the parent render, and the children still split', async () => {
    const { client } = await expectRendersLikeSource(
      `${head}import { useThing } from './hooks'
export function Page() {
  return <Hydrate when={useThing()}><p>child</p></Hydrate>
}`,
      {
        files: {
          './hooks': `import { useId } from 'react'
import { idle } from '@tanstack/react-start/hydration'
export const useThing = () => (useId(), idle())`,
        },
      },
    )
    expect(client.html).toContain('<p>child</p>')
  })

  // Only a literal opts out at compile time (docs): a dynamic value splits
  // the children whatever its value, and they hydrate like the server
  // renders them.
  // Source: gap H14 (round2/oracle-gaps)
  test.each([true, false])(
    'a dynamic split={flag} (%s) still splits the children',
    async (flag) => {
      const { client } = await expectRendersLikeSource(
        `${head}export function Page({ flag }) {
  return <Hydrate when={load()} split={flag}><p>child</p></Hydrate>
}`,
        { props: { flag } },
      )
      expect(client.html).toContain('<p>child</p>')
    },
  )

  // Bug: hook calls are only detected when the callee is a bare identifier,
  // so `React.useId()` in the children moves into the chunk component
  // instead of being rejected (SPEC J5.5).
  // Impact: the hook runs in another component on the client than on the
  // server (`useId` mismatches, hydration errors).
  // Source: Qwik optimizer example_use_optimization. #8504 has no test for
  // it and still moves `React.useId()` into the chunk.
  test.fails(
    'client: a hook called through a namespace is rejected with the fix',
    async () => {
      await expectExtractionRejected(
        `import * as React from 'react'
${childrenPage('<p id={React.useId()}>x</p>')}`,
        /\bhooks?\b/i,
      )
    },
  )

  // Bug: the rejection of `this` and `super` captures names no fix: the
  // docs' "Wrap the UI in a function component or use split={false}" is
  // missing from the error (function children and hook calls name theirs).
  // Impact: the user of a class component gets "cannot code-split JSX that
  // captures this" and no way out (SPEC J5.5: the error names the fix).
  // Source: FIX-PLAN HYD-07 (documented fix); hydrateWhen ThisCapture and
  // SuperCapture error fixtures.
  test.fails.each([
    { name: 'this', code: classPage('this') },
    { name: 'super', code: classPage('super') },
  ])(
    'client: children reading $name are rejected with the fix',
    async ({ name, code }) => {
      await expectExtractionRejected(code, new RegExp(`\\b${name}\\b`))
    },
  )

  // What the pin above asks besides the fix holds on main: the client
  // rejects the read, naming it, at the boundary.
  test.each([
    { name: 'this', code: classPage('this') },
    { name: 'super', code: classPage('super') },
  ])('client: children reading $name are rejected', async ({ name, code }) => {
    const diagnostics = await captureThrow(() => compileHydrate('client', code))
    expectCompileError(diagnostics[0]!.raw, {
      source: code,
      at: diagnosticPosition(code, '<Hydrate').line,
      names: [name],
    })
  })
})

describe('nested boundaries', () => {
  // The outer boundary uses `idle()` (the original fixture: `visible()`),
  // whose boundary renders an id: every boundary's id is compared.
  // Source: hydrate-when-transform.test.ts "supports nested Hydrate
  // boundaries in extracted virtual modules", "keeps sibling boundary ids
  // stable after nested boundaries"; hydrateWhen.test.ts "should extract
  // virtual modules and keep nested ids stable" and the Nested fixture
  // (gap H6).
  test('a nested boundary and a later sibling hydrate with the ids the server renders', async () => {
    const { client } = await expectRendersLikeSource(
      `${head}import { idle, interaction } from '@tanstack/react-start/hydration'
import { NestedButton, Outer, Sibling } from './widgets'
export function Page() {
  return (
    <>
      <Hydrate when={idle()}>
        <Outer />
        <Hydrate when={interaction()}>
          <NestedButton />
        </Hydrate>
      </Hydrate>
      <Hydrate when={idle()}>
        <Sibling />
      </Hydrate>
    </>
  )
}`,
      {
        files: {
          './widgets': `export const Outer = () => <section>Outer</section>
export const NestedButton = () => <button>Nested</button>
export const Sibling = () => <aside>Sibling</aside>`,
        },
      },
    )
    expect(client.html).toContain('<section>Outer</section>')
    expect(client.html).toContain('<button>Nested</button>')
    expect(client.html).toContain('<aside>Sibling</aside>')
  })
})

describe('which elements are boundaries', () => {
  // Source: hydrateWhen Renamed fixture (gap H11)
  test('a renamed import of Hydrate is a boundary', async () => {
    const { client } = await expectRendersLikeSource(
      `import { Hydrate as HW } from '@tanstack/react-start'
import { interaction } from '@tanstack/react-start/hydration'
import { SearchBox } from './search'
export function Page() {
  return (
    <HW when={interaction({ events: 'focusin' })}>
      <SearchBox />
    </HW>
  )
}`,
      { files: { './search': `export const SearchBox = () => <input />` } },
    )
    expect(client.html).toContain('<input/>')
    // The children's module loads with the chunk, not with the parent.
    expect(client.requestedAtLoad).not.toContain('/test/src/search.tsx')
    expect(client.lazy).toContain('/test/src/search.tsx')
  })

  describe('elements that are not the Start Hydrate', () => {
    afterEach(() => {
      delete (globalThis as { Hydrate?: unknown }).Hydrate
      delete (globalThis as { visible?: unknown }).visible
    })

    /** The real React the rendered graphs get. */
    let React: Record<string, any>
    beforeAll(async () => {
      React = await createModuleGraph({ packages: packagesDir }).importPackage(
        'react',
      )
    })

    /**
     * A component of the app named `Hydrate`: renders the props it receives
     * (functions as their type), its fallback and its children. The linker
     * maps a package specifier to a stub only, so it is written here, with
     * the real React.
     */
    const Foreign = ({ children, ...props }: Record<string, unknown>) =>
      React.createElement(
        'div',
        {
          'data-props': JSON.stringify(props, (key, value: unknown) =>
            typeof value === 'function'
              ? typeof value
              : key === 'fallback'
                ? 'rendered'
                : value,
          ),
        },
        props.fallback,
        children,
      )

    // Both environments leave the element as written: it receives the props
    // the uncompiled source passes (the fallback included) and renders like
    // it, and the client loads no chunk.
    // Source: hydrateWhen NoImport, NotFromTanstack and WrongImportName
    // fixtures (gap H12)
    test.each([
      {
        name: 'a global Hydrate',
        code: `export function Page() {
  return (
    <Hydrate when={visible()} fallback={<p>fallback-marker</p>}>
      <p>No transform</p>
    </Hydrate>
  )
}`,
        stubs: {},
        global: true,
      },
      {
        name: 'a Hydrate of another package',
        code: `import { Hydrate } from 'not-tanstack-start'
import { visible } from '@tanstack/react-start/hydration'
export function Page() {
  return (
    <Hydrate when={visible()} fallback={<p>fallback-marker</p>}>
      <p>No transform</p>
    </Hydrate>
  )
}`,
        stubs: { 'not-tanstack-start': { Hydrate: Foreign } },
        global: false,
      },
      // A namespace of another package and a binding shadowing the Start
      // namespace are look-alikes (SPEC J5.1, G15).
      // Source: FIX-PLAN §D "Namespace <Hydrate>" (negatives)
      {
        name: 'a Hydrate member of a namespace of another package',
        code: `import * as Start from 'not-tanstack-start'
import { visible } from '@tanstack/react-start/hydration'
export function Page() {
  return (
    <Start.Hydrate when={visible()} fallback={<p>fallback-marker</p>}>
      <p>No transform</p>
    </Start.Hydrate>
  )
}`,
        stubs: { 'not-tanstack-start': { Hydrate: Foreign } },
        global: false,
      },
      {
        name: 'a Hydrate member of a local shadowing the Start namespace',
        code: `import * as Start from '@tanstack/react-start'
import { visible } from '@tanstack/react-start/hydration'
import type { ComponentType } from 'react'
export const startHydrate = Start.Hydrate
export function Page({ Start }: { Start: { Hydrate: ComponentType<any> } }) {
  return (
    <Start.Hydrate when={visible()} fallback={<p>fallback-marker</p>}>
      <p>No transform</p>
    </Start.Hydrate>
  )
}`,
        stubs: {},
        global: false,
        props: { Start: { Hydrate: Foreign } },
      },
    ])('$name is left alone', async ({ code, stubs, global, props }) => {
      if (global) {
        Object.assign(globalThis, { Hydrate: Foreign, visible: () => 'v' })
      }
      const options = { stubs: stubs as Record<string, ModuleStub>, props }
      const source = await renderSource(code, options)
      expect(source.html).toContain('<p>fallback-marker</p><p>No transform</p>')
      expect((await renderServer(code, options)).html).toBe(source.html)
      const client = await renderClient(code, options)
      expect(client.html).toBe(source.html)
      expect(client.loadedChunks).toEqual([])
    })
  })

  // A namespace-imported `<Start.Hydrate>` (React and Solid, Vite and
  // Rsbuild) hydrates the server's HTML in real pages
  // (integration/hydrate-pages-*.test.ts "namespace-imported Start.Hydrate
  // boundaries"), where splitting it is pinned as a goal.

  // `@tanstack/solid-router` cannot be linked in process (`render.ts`): the
  // outputs are checked to be valid, split on the client, and to need no
  // React package.
  // Source: hydrate-when-transform.test.ts "uses the Solid Router import
  // source for Solid Hydrate boundaries" (gap H22).
  test('Solid: a Hydrate of @tanstack/solid-start splits with the Solid packages', async () => {
    const code = `import { Hydrate } from '@tanstack/solid-start'
import { visible } from '@tanstack/solid-start/hydration'
export function Page() {
  return (
    <Hydrate when={visible()}>
      <Widget title="Hello" />
    </Hydrate>
  )
}
function Widget(props: { title: string }) {
  return <p>{props.title}</p>
}`
    const isReact = (source: string) =>
      /^(?:react|react-dom)(?:\/|$)|^@tanstack\/react-/.test(source)
    for (const env of ['client', 'server'] as const) {
      const { parent, chunks, chunkIds } = await compileHydrate(env, code, {
        framework: 'solid',
      })
      if (env === 'client') {
        expect(chunkIds).not.toEqual([])
      }
      for (const output of [parent, ...chunks]) {
        expect(
          await getModuleErrors(output, undefined, { source: code }),
        ).toEqual([])
        expect(importSources(output).filter(isReact)).toEqual([])
      }
    }
  })
})

// Rsbuild loads a chunk with the code of its source file, and may do so
// before the edited parent module is compiled again: the chunk renders the
// edited children. (Vite loads the source module first; dev servers of both
// in hydrate-build.test.ts.)
// Source: hydrate-when-transform.test.ts "invalidates cached Hydrate source
// for virtual module loads" (the compiler half of gaps H21 / DV42)
test('client: a chunk loaded with the edited source before the parent is compiled again renders the new children', async () => {
  const source = (text: string) => `${head}export function Page() {
  return <Hydrate when={load()}><p>${text}</p></Hydrate>
}`
  const compiled = await compileHydrate('client', source('Old'))
  const render = async (edited?: string) =>
    (
      await renderClient(source('Old'), {
        compiled,
        loadChunk: (id) => loadChunk(compiled.plugin, 'client', id, edited),
      })
    ).html
  expect(await render()).toContain('<p>Old</p>')
  expect(await render(source('New'))).toContain('<p>New</p>')
})

// Source: V4 red-astra-r2/12. A shared options object also renders outside
// the boundary: removing its fallback must not mutate that other consumer.
test('a fallback spread shared with an aside keeps the aside on server and client', async () => {
  const { server, client } = await expectRendersLikeSource(`${head}
const opts = { when: load(), fallback: <b>wait</b> }
export function Page() {
  return <><Hydrate {...opts}><p>ready</p></Hydrate><aside>{opts.fallback}</aside></>
}`)
  expect(server.html).toContain('<aside><b>wait</b></aside>')
  expect(client.html).toContain('<aside><b>wait</b></aside>')
})
