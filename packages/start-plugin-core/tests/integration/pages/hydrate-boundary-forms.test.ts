/**
 * The forms a `<Hydrate>` boundary is written in, and what each environment
 * makes of it: the server strips the client-only `fallback` however it is
 * passed, `split={false}` keeps the children in place, children that cannot
 * be split are rejected clearly, nested boundaries hydrate with the ids the
 * server renders, and only the `Hydrate` of a `@tanstack/*-start` package is
 * a boundary.
 *
 * Through the public Start plugin on a dev server (`render.ts`): the server
 * render (React's server renderer in the SSR environment) is compared with
 * the uncompiled source (a plain Vite host without the Start plugin), and a
 * real page hydrates it with every gate opened. What only a whole app
 * observes (the client receiving the fallback, `prefetch`, `onHydrated`)
 * is checked by real pages (integration/hydrate-pages*.test.ts).
 */
import { describe, expect, test } from 'vitest'
import {
  diagnosticPosition,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { expectNotLoaded } from '@tanstack/compiler-test-utils/importers'
import { compileError, expectCompileError } from '../../regression-helpers'
import {
  editableFiles,
  expectClientRendersLikeServer,
  expectHydratedCleanly,
  expectRendersLikeSource,
  renderClient,
  renderServer,
  renderSource,
  useEditHost,
  useHydrateHost,
  useSolidHost,
  withoutHydrationIds,
} from '../../render'
import type { HydrateHost, RenderOptions } from '../../render'

const hosts = useHydrateHost()
const solidHost = useSolidHost()
const editHost = useEditHost()

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
  const started = await hosts()
  const source = await renderSource(started, code, options)
  const server = await renderServer(started, code, options)
  expect(withoutHydrationIds(server.html)).toBe(source.html)
  return server
}

/**
 * Everything an environment reported for a case it rejected: the error it
 * threw (and, when the helper returns them, what it reported meanwhile).
 */
function reportedOf(failure: unknown): Array<unknown> {
  const withReports = failure as { error?: unknown; reported?: Array<unknown> }
  return failure instanceof Error && Array.isArray(withReports.reported)
    ? [withReports.error, ...withReports.reported]
    : [failure]
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
  // §5.9).
  test.each(forms)(
    'server: $name is removed',
    async ({ code, moduleLevel }) => {
      const server = await expectServerRendersLikeSource(`${formsHead}${code}`)
      expect(server.html).toContain('<p>child</p>')
      if (!moduleLevel) {
        expect(server.code).not.toContain('fallback-marker')
      }
    },
  )

  // That the client boundary receives the fallback (and `prefetch`,
  // `onHydrated`) is checked by real pages.
  test.each(forms)(
    'client: a boundary with $name renders like the server',
    async ({ code }) => {
      const { client } = await expectClientRendersLikeServer(
        await hosts(),
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
      // What the SSR environment's module graph reaches from the module.
      expectNotLoaded(await server.case.serverLoads(), ['./client-spinner'])
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
    // The prop is a media strategy that does not match: the gate stays
    // closed, and nothing loads on demand.
    { name: 'a prop', when: 'props.when', closed: true },
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
    async ({ setup = '', when, closed = false }) => {
      const code = `${head}import { idle, interaction, media, visible } from '@tanstack/react-start/hydration'
export function Page(props) {
  ${setup}return <Hydrate when={${when}} fallback={<p>fallback-marker</p>}><p>child</p></Hydrate>
}`
      const { server, client } = await expectRendersLikeSource(
        await hosts(),
        code,
        {
          // A strategy of the app's own hydration package, in each realm.
          setup: `import { media } from '@tanstack/react-start/hydration'
globalThis.__propsWhen = media('(max-width: 2px)')
export const cleanup = ['__propsWhen']`,
          render: 'h(m.Page, { when: globalThis.__propsWhen, eager: false })',
          split: !closed,
        },
      )
      if (closed) {
        expect(client.lazy).toEqual([])
      }
      expect(client.html).toContain('<p>child</p>')
      expect(server.code).not.toContain('fallback-marker')
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
 * The client environment, which extracts the children, rejects `code` with
 * an error (SPEC J5.5) reporting a line of the boundary (the frame marks
 * it, or a position). Wording and frame layout are free (SPEC §5.7). The
 * server renders the children in place: rejecting them there is neither
 * required nor forbidden.
 */
async function expectExtractionRejected(host: HydrateHost, code: string) {
  const startCase = await host.start.case({ 'module.tsx': code, ...hookFiles })
  const failure = await compileError(startCase, 'client')
  expect(failure, 'a client compile error').toBeInstanceOf(Error)
  const reported = reportedOf(failure)
  const first = diagnosticPosition(code, '<Hydrate').line
  const last = diagnosticPosition(code, '</Hydrate>').line
  const lines = Array.from(
    { length: last - first + 1 },
    (_, index) => first + index,
  )
  expect(
    lines.filter(
      (line) =>
        findDiagnostics(reported, {
          severity: 'error',
          position: { line },
        }).length > 0,
    ),
    `a line of the boundary (${first}-${last})`,
  ).not.toEqual([])
}

const hookFiles = { 'hooks.ts': hooks['./hooks'] }

/** The unsafe children of SPEC J5.5. */
const unsafeChildren = [
  {
    name: 'a function child (an arrow)',
    code: (split = '') => childrenPage('{() => <p>child</p>}', split),
  },
  {
    name: 'a function child (a parenthesized arrow)',
    code: (split = '') => childrenPage('{(() => <p>child</p>)}', split),
  },
  {
    name: 'a function child (a function expression)',
    code: (split = '') =>
      childrenPage('{function () { return <p>child</p> }}', split),
  },
  {
    name: 'a hook call',
    code: (split = '') => childrenPage('<p>{useThing()}</p>', split),
  },
  {
    // Digit-bearing hook names follow React's convention.
    name: 'a hook call named use3D',
    code: (split = '') => childrenPage('<p>{use3D()}</p>', split),
  },
  {
    name: 'a parenthesized hook call',
    code: (split = '') => childrenPage('<p>{(useThing)()}</p>', split),
  },
]

describe('children that cannot be split', () => {
  // Source: hydrate-when-transform.test.ts "rejects function-as-children
  // unless the boundary opts out of splitting", "rejects hook calls that
  // would be moved into an extracted component", "rejects parenthesized
  // unsafe extraction"; hydrateWhen FunctionChild and HookCall error
  // fixtures.
  test.each(unsafeChildren)(
    'client: $name is rejected at the boundary',
    async ({ code }) => {
      await expectExtractionRejected(await hosts(), code())
    },
  )

  // Only the literal `split={false}` opts out (docs): a dynamic `split`
  // extracts, so it rejects the same children.
  test.each(unsafeChildren)(
    'client: $name with a dynamic split={flag} is rejected at the boundary',
    async ({ code }) => {
      await expectExtractionRejected(await hosts(), code(' split={flag}'))
    },
  )

  // With the literal `split={false}` the compiler neither extracts nor
  // rejects the children (SPEC J5.5): every output renders like the
  // uncompiled source (what React makes of a function child is the
  // framework's business) and nothing loads on demand.
  // Source: hydrate-when-transform.test.ts "respects parenthesized
  // split={false}"; hydrateWhen SplitFalseFunctionChild fixture.
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
      render: 'new m.Page().render()',
    },
    {
      name: 'a read of super',
      code: classPage('super', ' split={false}'),
      render: 'new m.Page().render()',
    },
  ])(
    '$name with split={false} stays in place in both environments',
    async ({ code, render }) => {
      const { client } = await expectRendersLikeSource(await hosts(), code, {
        files: hooks,
        render,
        split: false,
      })
      expect(client.lazy).toEqual([])
    },
  )

  // The props of the boundary itself are not its children: they render in
  // the parent on both sides, so a hook call there does not stop the split.
  test('a hook call in the props of the boundary runs in the parent render, and the children still split', async () => {
    const { client } = await expectRendersLikeSource(
      await hosts(),
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
  test.each([true, false])(
    'a dynamic split={flag} (%s) still splits the children',
    async (flag) => {
      const { client } = await expectRendersLikeSource(
        await hosts(),
        `${head}export function Page({ flag }) {
  return <Hydrate when={load()} split={flag}><p>child</p></Hydrate>
}`,
        { props: { flag } },
      )
      expect(client.html).toContain('<p>child</p>')
    },
  )

  // Bug: hook calls are only detected when the callee is a bare identifier,
  // so `React.useId()` in the children moves into the split code instead of
  // being rejected (SPEC J5.5).
  // Impact: the hook runs in another component on the client than on the
  // server (`useId` mismatches, hydration errors).
  // Source: Qwik optimizer example_use_optimization. #8504 has no test for
  // it and still moves `React.useId()` into the chunk.
  test.fails(
    'client: a hook called through a namespace is rejected at the boundary',
    async () => {
      await expectExtractionRejected(
        await hosts(),
        `import * as React from 'react'
${childrenPage('<p id={React.useId()}>x</p>')}`,
      )
    },
  )

  // The client rejects children reading `this` or `super` at the boundary.
  test.each([
    { name: 'this', code: classPage('this') },
    { name: 'super', code: classPage('super') },
  ])('client: children reading $name are rejected', async ({ code }) => {
    const startCase = await (await hosts()).start.case({ 'module.tsx': code })
    expectCompileError(await compileError(startCase, 'client'), {
      source: code,
      at: diagnosticPosition(code, '<Hydrate').line,
    })
  })
})

describe('nested boundaries', () => {
  // The outer boundary uses `idle()` (the original fixture: `visible()`),
  // whose boundary renders an id: every boundary's id is compared.
  // Source: hydrate-when-transform.test.ts "supports nested Hydrate
  // boundaries in extracted virtual modules", "keeps sibling boundary ids
  // stable after nested boundaries"; hydrateWhen.test.ts "should extract
  // virtual modules and keep nested ids stable" and the Nested fixture.
  test('a nested boundary and a later sibling hydrate with the ids the server renders', async () => {
    const { client } = await expectRendersLikeSource(
      await hosts(),
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
  // Source: hydrateWhen Renamed fixture.
  test('a renamed import of Hydrate is a boundary', async () => {
    const { client } = await expectRendersLikeSource(
      await hosts(),
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
    expect(client.html).toContain('<input>')
    // The children's module loads with the split code, not with the parent.
    expect(client.loaded).not.toContain('./search')
    expect(client.lazy).toContain('./search')
  })

  describe('elements that are not the Start Hydrate', () => {
    /**
     * A component of the app named `Hydrate`: renders the props it receives
     * (functions as their type), its fallback and its children, with the
     * app's React.
     */
    const foreign = `import { createElement } from 'react'
export const Hydrate = ({ children, ...props }) =>
  createElement(
    'div',
    {
      'data-props': JSON.stringify(props, (key, value) =>
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
`
    /** `foreign` as a package of the app (`not-tanstack-start`). */
    const foreignPackage = {
      'node_modules/not-tanstack-start/package.json': JSON.stringify({
        name: 'not-tanstack-start',
        type: 'module',
        exports: './index.js',
      }),
      'node_modules/not-tanstack-start/index.js': foreign,
    }

    // Both environments leave the element as written: it receives the props
    // the uncompiled source passes (the fallback included) and renders like
    // it, and the client loads nothing on demand.
    // Source: hydrateWhen NoImport, NotFromTanstack and WrongImportName
    // fixtures.
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
        files: { './foreign': foreign },
        setup: `import { Hydrate } from './foreign'
Object.assign(globalThis, { Hydrate, visible: () => 'v' })
export const cleanup = ['Hydrate', 'visible']`,
        render: undefined,
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
        files: foreignPackage,
        setup: undefined,
        render: undefined,
      },
      // A namespace of another package and a binding shadowing the Start
      // namespace are look-alikes (SPEC J5.1, G15).
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
        files: foreignPackage,
        setup: undefined,
        render: undefined,
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
        files: { './foreign': foreign },
        setup: `import { Hydrate } from './foreign'
globalThis.__foreign = { Hydrate }
export const cleanup = ['__foreign']`,
        render: 'h(m.Page, { Start: globalThis.__foreign })',
      },
    ])('$name is left alone', async ({ code, files, setup, render }) => {
      const started = await hosts()
      const options = { files, setup, render }
      const source = await renderSource(started, code, options)
      expect(source.html).toContain('<p>fallback-marker</p><p>No transform</p>')
      expect((await renderServer(started, code, options)).html).toBe(
        source.html,
      )
      const client = await renderClient(started, code, options)
      expectHydratedCleanly(client)
      expect(client.html).toBe(source.html)
      expect(client.lazy).toEqual([])
    })
  })

  // A namespace-imported `<Start.Hydrate>` (React and Solid, Vite and
  // Rsbuild) hydrates the server's HTML in real pages
  // (integration/hydrate-pages-*.test.ts "namespace-imported Start.Hydrate
  // boundaries"), where splitting it is pinned as a goal.

  // A Solid app (`vite-plugin-solid`): both environments serve and evaluate
  // the module, the page mounts it and loads its split code, and nothing it
  // loads, on either side, is a React package.
  // Source: hydrate-when-transform.test.ts "uses the Solid Router import
  // source for Solid Hydrate boundaries".
  test('Solid: a Hydrate of @tanstack/solid-start splits with the Solid packages', async () => {
    const solid = await solidHost()
    const mounted =
      await solid.mount(`import { Hydrate } from '@tanstack/solid-start'
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
}`)
    expect(mounted.errors).toEqual([])
    expect(mounted.html).toContain('<p>Hello</p>')
    expect(mounted.lazy).not.toEqual([])
    const isReact = (name: string) =>
      /^(?:\/node_modules\/\.vite\/deps\/)?(react|react-dom)(?:[_/.]|$)|@tanstack\/react-/.test(
        name,
      )
    expect(mounted.lazy.filter(isReact)).toEqual([])
    expect(mounted.loads.filter(isReact)).toEqual([])
    expect(mounted.serverLoads.filter(isReact)).toEqual([])
  })
})

// When a module changes, the split code that loads afterwards renders the
// edited children, whichever module the dev server compiles first (Rsbuild
// loads split code with the code of its source file; dev servers of both in
// hydrate-build.test.ts).
// Source: hydrate-when-transform.test.ts "invalidates cached Hydrate source
// for virtual module loads" (the compiler half; the dev-server half is in
// hydrate-build-dev.test.ts).
test('client: a chunk loaded with the edited source before the parent is compiled again renders the new children', async () => {
  const source = (text: string) => `${head}export function Page() {
  return <Hydrate when={load()}><p>${text}</p></Hydrate>
}`
  const started = await editHost()
  const files = await editableFiles(started, source('Old'))
  const render = async () => {
    const rendered = await renderClient(started, '', {
      target: files.target,
      freshPage: true,
    })
    expectHydratedCleanly(rendered)
    return rendered.html
  }
  expect(await render()).toContain('<p>Old</p>')
  await files.edit(source('New'))
  expect(await render()).toContain('<p>New</p>')
}, 30_000)

// A shared options object also renders outside
// the boundary: removing its fallback must not mutate that other consumer.
test('a fallback spread shared with an aside keeps the aside on server and client', async () => {
  const { server, client } = await expectRendersLikeSource(
    await hosts(),
    `${head}
const opts = { when: load(), fallback: <b>wait</b> }
export function Page() {
  return <><Hydrate {...opts}><p>ready</p></Hydrate><aside>{opts.fallback}</aside></>
}`,
  )
  expect(server.html).toContain('<aside><b>wait</b></aside>')
  expect(client.html).toContain('<aside><b>wait</b></aside>')
})
