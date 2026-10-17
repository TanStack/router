/**
 * The forms a `<Hydrate>` boundary is written in, and what each environment
 * makes of it: the server strips the client-only `fallback` however it is
 * passed, `split={false}` keeps the children in place, children that cannot
 * be split are rejected clearly (or, ideally, supported), nested boundaries
 * hydrate with the ids the server renders, and only the `Hydrate` of a
 * `@tanstack/*-start` package is a boundary.
 */
import { afterEach, describe, expect, test } from 'vitest'
import {
  MissingHydrateSourceError,
  createHydrateCompilerPlugin,
} from '../src/hydrate-when-transform'
import {
  compileErrorMessage,
  compileHydrate,
  createStartCompiler,
  evaluateModule,
  expectRenderedThroughChunks,
  getChunkIds,
  hydrateStubs,
  importSources,
  loadClientModule,
  renderBoundaries,
  renderChunk,
} from './regression-helpers'
import { getModuleErrors } from '@tanstack/compiler-test-utils/validate-module'
import type { Framework, ModuleStub } from './regression-helpers'

const head = `import { Hydrate } from '@tanstack/react-start'\n`

/** Compiles `code` for each environment, or returns the error it throws. */
async function compileEnvs(code: string, framework?: Framework) {
  const compiled = async (env: 'client' | 'server') =>
    compileHydrate(env, code, { framework }).catch((error: Error) => error)
  return { client: await compiled('client'), server: await compiled('server') }
}

/** The messages of the compile errors among `results`, without code frames. */
function rejections(results: Record<string, unknown>) {
  return Object.values(results)
    .filter((result) => result instanceof Error)
    .map(compileErrorMessage)
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
  return <Hydrate when="visible" fallback={<p>fallback-marker</p>}><p>child</p></Hydrate>
}`,
    },
    {
      name: 'a direct fallback with split={false}',
      code: `export function Page() {
  return <Hydrate when="visible" split={false} fallback={<p>fallback-marker</p>}><p>child</p></Hydrate>
}`,
    },
    {
      name: 'a direct fallback next to prefetch and onHydrated',
      code: `export function Page() {
  return <Hydrate when="visible" prefetch={() => 'prefetched'} fallback={<p>fallback-marker</p>} onHydrated={() => 'hydrated'}><p>child</p></Hydrate>
}`,
      received: { prefetch: 'prefetched', onHydrated: 'hydrated' },
    },
    {
      name: 'an inline spread',
      code: `export function Page() {
  return <Hydrate {...{ when: 'visible', fallback: <p>fallback-marker</p> }}><p>child</p></Hydrate>
}`,
    },
    {
      name: 'a parenthesized inline spread',
      code: `export function Page() {
  return <Hydrate {...({ when: 'visible', fallback: <p>fallback-marker</p> })}><p>child</p></Hydrate>
}`,
    },
    {
      name: 'a spread used once, declared before the component',
      code: `const props = { when: 'visible', fallback: <p>fallback-marker</p> }
export function Page() {
  return <Hydrate {...props}><p>child</p></Hydrate>
}`,
    },
    {
      name: 'a spread used once, declared after the component',
      code: `export function Page() {
  return <Hydrate {...props}><p>child</p></Hydrate>
}
const props = { when: 'visible', fallback: <p>fallback-marker</p> }`,
    },
    {
      name: 'a parenthesized spread used once',
      code: `const props = ({ when: 'visible', fallback: <p>fallback-marker</p> })
export function Page() {
  return <Hydrate {...(props)}><p>child</p></Hydrate>
}`,
    },
    {
      // Source: hydrateWhenSplitFalse.tsx fixture (main)
      name: 'a module-level element',
      code: `const fallback = <p>fallback-marker</p>
export function Page() {
  return <Hydrate when="visible" fallback={fallback}><p>child</p></Hydrate>
}`,
    },
    {
      name: 'a module-level element with split={false}',
      code: `const fallback = <p>fallback-marker</p>
export function Page() {
  return <Hydrate when="visible" split={false} fallback={fallback}><p>child</p></Hydrate>
}`,
    },
    {
      name: 'a computed fallback key',
      code: `export function Page() {
  return <Hydrate {...{ when: 'visible', ['fallback']: <p>fallback-marker</p> }}><p>child</p></Hydrate>
}`,
    },
    {
      name: 'an inline spread with quoted keys',
      code: `export function Page() {
  return <Hydrate {...{ 'when': 'visible', 'fallback': <p>fallback-marker</p> }}><p>child</p></Hydrate>
}`,
    },
    {
      name: 'a spread used once with split={false}',
      code: `const props = { when: 'visible', fallback: <p>fallback-marker</p> }
export function Page() {
  return <Hydrate split={false} {...props}><p>child</p></Hydrate>
}`,
    },
  ] as Array<{
    name: string
    code: string
    received?: { prefetch: string; onHydrated: string }
  }>

  /**
   * The props other than the children and the fallback that each boundary
   * received (`prefetch` and `onHydrated` called): every row passes `when`.
   */
  const otherProps = (boundaries: Array<Record<string, unknown>>) =>
    boundaries.map((props) => ({
      when: props.when,
      prefetch: (props.prefetch as (() => unknown) | undefined)?.(),
      onHydrated: (props.onHydrated as (() => unknown) | undefined)?.(),
    }))
  const expectedProps = (received: (typeof forms)[number]['received']) => [
    {
      when: 'visible',
      prefetch: undefined,
      onHydrated: undefined,
      ...received,
    },
  ]

  /** `<Hydrate>` stubs recording the props each boundary renders with. */
  const recordingStubs = (boundaries: Array<Record<string, unknown>>) => ({
    ...hydrateStubs(),
    '@tanstack/react-start': {
      Hydrate: (props: Record<string, unknown>) => {
        boundaries.push(props)
        return `[${props.children ?? ''}]`
      },
    },
  })

  test.each(forms)('server: $name is removed', async ({ code, received }) => {
    const { parent } = await compileHydrate('server', `${head}${code}`)
    expect(await getModuleErrors(parent)).toEqual([])
    const boundaries: Array<Record<string, unknown>> = []
    const module = await evaluateModule(parent, recordingStubs(boundaries))
    expect(module.Page()).toBe('[<p>child</p>]')
    expect(boundaries.map((props) => props.fallback)).toEqual([undefined])
    expect(otherProps(boundaries)).toEqual(expectedProps(received))
    expect(parent).not.toContain('fallback-marker')
  })

  test.each(forms)(
    'client: $name reaches the boundary',
    async ({ code, received }) => {
      const boundaries: Array<Record<string, unknown>> = []
      const { module } = await loadClientModule(`${head}${code}`, {
        stubs: recordingStubs(boundaries),
      })
      expect(module.Page()).toBe('[<p>child</p>]')
      expect(boundaries.map((props) => props.fallback)).toEqual([
        '<p>fallback-marker</p>',
      ])
      expect(otherProps(boundaries)).toEqual(expectedProps(received))
    },
  )

  // A client-only module the fallback renders (e.g. a spinner reading browser
  // APIs) is not loaded by the server module, however the fallback reaches
  // it; module bindings the children read stay.
  test.each([
    {
      name: 'an imported component',
      code: `import { Spinner } from './client-spinner'
export function Page() { return <Hydrate fallback={<Spinner />}><p>child</p></Hydrate> }`,
    },
    {
      name: 'a const component rendering an import',
      code: `import { Spinner } from './client-spinner'
const Fallback = () => <Spinner />
export function Page() { return <Hydrate fallback={<Fallback />}><p>child</p></Hydrate> }`,
    },
    {
      name: 'a function component rendering an import',
      code: `import { Spinner } from './client-spinner'
function Fallback() { return <Spinner /> }
export function Page() { return <Hydrate fallback={<Fallback />}><p>child</p></Hydrate> }`,
    },
    {
      name: 'a class rendering an import',
      code: `import { Spinner } from './client-spinner'
class Fallback { render() { return <Spinner /> } }
export function Page() { return <Hydrate fallback={new Fallback().render()}><p>child</p></Hydrate> }`,
    },
    {
      name: 'a binding in an inline spread',
      code: `import { Spinner } from './client-spinner'
const spinner = <Spinner />
export function Page() { return <Hydrate {...{ fallback: spinner }}><p>child</p></Hydrate> }`,
    },
    {
      name: 'an element in an inline spread',
      code: `import { Spinner } from './client-spinner'
export function Page() { return <Hydrate {...{ fallback: <Spinner /> }}><p>child</p></Hydrate> }`,
    },
    {
      name: 'a destructured namespace import',
      code: `import * as lib from './client-spinner'
const { Spinner } = lib
export function Page() { return <Hydrate fallback={<Spinner />}><p>child</p></Hydrate> }`,
    },
    {
      name: 'a declarator next to one the children read',
      code: `import { Spinner } from './client-spinner'
const label = 'child', spinner = <Spinner />
export function Page() { return <Hydrate fallback={spinner}><p>{label}</p></Hydrate> }`,
    },
    {
      name: 'a spread used once with split={false}',
      code: `import { Spinner } from './client-spinner'
const opts = { fallback: <Spinner /> }
export function Page() { return <Hydrate split={false} {...opts}><p>child</p></Hydrate> }`,
    },
  ])(
    'server: a fallback through $name does not load its client-only module',
    async ({ code }) => {
      const { parent } = await compileHydrate('server', `${head}${code}`)
      expect(await getModuleErrors(parent)).toEqual([])
      expect(importSources(parent)).not.toContain('./client-spinner')
      const boundaries: Array<Record<string, unknown>> = []
      const module = await evaluateModule(parent, recordingStubs(boundaries))
      expect(module.Page()).toBe('[<p>child</p>]')
      expect(boundaries.map((props) => props.fallback)).toEqual([undefined])
    },
  )

  test('server: a module-level destructuring read by the fallback and the children keeps the children binding', async () => {
    const { parent } = await compileHydrate(
      'server',
      `${head}const { a, b } = { a: 'A', b: 'B' }
export function Page() {
  return <Hydrate fallback={<p>{a}{b}</p>}><p>{b}</p></Hydrate>
}`,
    )
    expect(await getModuleErrors(parent)).toEqual([])
    const module = await evaluateModule(parent, hydrateStubs())
    expect(module.Page()).toBe('[<p>B</p>]')
  })

  // Whatever expression `when` is, both environments pass its value to the
  // boundary (the server strips the fallback next to it).
  test.each([
    { name: 'a strategy call', when: 'idle()', expected: 'idle()' },
    {
      name: 'a strategy call with options',
      when: `interaction({ events: 'focusin' })`,
      expected: 'interaction({"events":"focusin"})',
    },
    { name: 'a prop', when: 'props.when', expected: 'from-props' },
    {
      name: 'a local',
      setup: `const strategy = media('(min-width: 1px)')\n  `,
      when: 'strategy',
      expected: 'media("(min-width: 1px)")',
    },
    {
      name: 'a conditional',
      when: 'props.eager ? load() : visible()',
      expected: 'visible()',
    },
    {
      name: 'a custom function',
      when: `() => 'custom'`,
      expected: 'custom',
    },
  ])(
    'when as $name reaches the boundary in both environments',
    async ({ setup = '', when, expected }) => {
      const code = `${head}import { idle, interaction, load, media, visible } from '@tanstack/react-start/hydration'
export function Page(props) {
  ${setup}return <Hydrate when={${when}} fallback={<p>fallback-marker</p>}><p>child</p></Hydrate>
}`
      /** Strategy stubs rendering their call. */
      const strategy =
        (name: string) =>
        (...args: Array<unknown>) =>
          `${name}(${args.map((arg) => JSON.stringify(arg)).join(',')})`
      let lazyChunks: Array<{ rendered: boolean }> = []
      const render = async (env: 'client' | 'server') => {
        const boundaries: Array<Record<string, unknown>> = []
        const stubs = {
          ...recordingStubs(boundaries),
          '@tanstack/react-start/hydration': Object.fromEntries(
            ['idle', 'interaction', 'load', 'media', 'visible'].map((name) => [
              name,
              strategy(name),
            ]),
          ),
        }
        let module: Record<string, any>
        if (env === 'server') {
          const { parent } = await compileHydrate('server', code)
          module = await evaluateModule(parent, stubs)
        } else {
          const loaded = await loadClientModule(code, { stubs })
          module = loaded.module
          lazyChunks = loaded.lazyChunks
        }
        return {
          html: module.Page({ when: 'from-props', eager: false }),
          when: boundaries.map((props) =>
            typeof props.when === 'function' ? props.when() : props.when,
          ),
          fallback: boundaries.map((props) => props.fallback),
        }
      }
      expect(await render('server')).toEqual({
        html: '[<p>child</p>]',
        when: [expected],
        fallback: [undefined],
      })
      expect(await render('client')).toEqual({
        html: '[<p>child</p>]',
        when: [expected],
        fallback: ['<p>fallback-marker</p>'],
      })
      expectRenderedThroughChunks(lazyChunks)
    },
  )
})

/**
 * JSX runtime passing children to components as they are (a single child
 * unwrapped), so a function child reaches the component.
 */
const rawChildrenRuntime = `const __Fragment = Symbol('Fragment')
const __jsx = (type, props, ...children) => {
  if (typeof type === 'function') {
    return type(children.length === 0 ? { ...props } : { ...props, children: children.length === 1 ? children[0] : children })
  }
  const text = children.flat(Infinity).filter((c) => c != null && c !== false && c !== true).join('')
  if (type === __Fragment) return text
  return '<' + type + '>' + text + '</' + type + '>'
}
`

/**
 * `<Hydrate>` stubs rendering a function child as `fn(<its output>)` and
 * other children inside the boundary.
 */
const functionChildStubs = (framework: Framework = 'react') => ({
  ...hydrateStubs(framework),
  [`@tanstack/${framework}-start`]: {
    Hydrate: (props: { children?: unknown }) =>
      typeof props.children === 'function'
        ? `fn(${props.children()})`
        : `[${props.children ?? ''}]`,
  },
})

describe('split={false}', () => {
  // String values of `split` are accepted too, for untyped or JS callers.
  // Source: hydrate-split-modules.test.ts "split=\"false\" keeps
  // function-as-children in place"; hydrate-when-transform.test.ts "respects
  // parenthesized split={false}"; hydrateWhen SplitFalseFunctionChild
  // fixture.
  test.each([
    { name: 'false', split: '{false}' },
    { name: 'a parenthesized false', split: '{(false)}' },
    { name: 'the string "false"', split: '"false"' },
  ])('$name keeps function-as-children in place', async ({ split }) => {
    await expectFunctionChildInPlace(split)
  })

  // Bug: only a (parenthesized) boolean or string literal is read as
  // `split={false}`; the boundary is split and its function child rejected.
  // Impact: valid code fails to build ("Hydrate cannot code-split
  // function-as-children").
  // Source: #8504 hydrate-split-modules.test.ts (differential fuzzing; red
  // on main)
  test.fails.each([
    { name: 'false satisfies boolean', split: '{(false satisfies boolean)}' },
    { name: 'false as boolean', split: '{(false as boolean)}' },
    {
      name: 'an unparenthesized false as boolean',
      split: '{false as boolean}',
    },
  ])('$name keeps function-as-children in place', async ({ split }) => {
    await expectFunctionChildInPlace(split)
  })

  // Only a literal opts out at compile time (docs): a dynamic value splits
  // the children whatever its value, and they hydrate like the server
  // renders them.
  // Source: gap H14 (round2/oracle-gaps)
  test.each([true, false])(
    'a dynamic split={flag} (%s) still splits the children',
    async (flag) => {
      const code = `${head}export function Page({ flag }) {
  return <Hydrate split={flag}><p>child</p></Hydrate>
}`
      const render = (module: Record<string, any>) => module.Page({ flag })
      const server = await renderBoundaries('server', code, render)
      expect(server.html).toBe('[<p>child</p>]')
      expect(await renderBoundaries('client', code, render)).toEqual(server)
      const { module, lazyChunks } = await loadClientModule(code)
      expect(render(module)).toBe('[<p>child</p>]')
      expectRenderedThroughChunks(lazyChunks)
    },
  )

  /**
   * Both environments render the function child of a `split` boundary in
   * place, without chunks.
   */
  async function expectFunctionChildInPlace(split: string) {
    const code = `${head}import { idle } from '@tanstack/react-start/hydration'
export function Page() {
  return <Hydrate when={idle()} split=${split}>{() => <p>render prop</p>}</Hydrate>
}`
    const server = await compileHydrate('server', code)
    expect(getChunkIds(server.parent)).toEqual([])
    const serverModule = await evaluateModule(
      server.parent,
      functionChildStubs(),
      { runtime: rawChildrenRuntime },
    )
    expect(serverModule.Page()).toBe('fn(<p>render prop</p>)')
    const client = await loadClientModule(code, {
      stubs: functionChildStubs(),
      runtime: rawChildrenRuntime,
    })
    expect(client.chunkIds).toEqual([])
    expect(client.module.Page()).toBe('fn(<p>render prop</p>)')
  }
})

describe('children that cannot be split', () => {
  // A React component cannot render a function child, so a split boundary
  // with one is rejected (by either environment).
  // Source: hydrate-when-transform.test.ts "rejects function-as-children
  // unless the boundary opts out of splitting", "rejects parenthesized
  // unsafe extraction" (row 1); hydrateWhen FunctionChild error fixture.
  test.each([
    { name: 'an arrow', child: '{() => <p>child</p>}' },
    { name: 'a parenthesized arrow', child: '{(() => <p>child</p>)}' },
    {
      name: 'a function expression',
      child: '{function () { return <p>child</p> }}',
    },
  ])('a function child ($name) is rejected', async ({ child }) => {
    const results =
      await compileEnvs(`${head}import { idle } from '@tanstack/react-start/hydration'
export function Page() {
  return <Hydrate when={idle()}>${child}</Hydrate>
}`)
    expect(rejections(results)).toContainEqual(
      expect.stringMatching(/Hydrate[^]*function/),
    )
  })

  // Goal (optional): Solid components take function children, so a Solid
  // boundary may split one like any other children. Today it is rejected
  // like in React.
  test.fails('Solid: a function child renders through the chunk', async () => {
    const { module, lazyChunks } = await loadClientModule(
      `import { Hydrate } from '@tanstack/solid-start'
export function Page() {
  return <Hydrate>{() => <p>x</p>}</Hydrate>
}`,
      {
        framework: 'solid',
        stubs: functionChildStubs('solid'),
        runtime: rawChildrenRuntime,
      },
    )
    expect(String(module.Page())).toMatch(/<p>x<\/p>/)
    expect(lazyChunks.map((chunk) => chunk.rendered)).toEqual([true])
  })
})

describe('hooks called by the children', () => {
  /**
   * JSX runtime recording how deep in component calls the code runs
   * (`globalThis.__componentDepth`; 0 in the code of the component the test
   * calls).
   */
  const depthRuntime = `const __Fragment = Symbol('Fragment')
const __jsx = (type, props, ...children) => {
  const text = children.flat(Infinity).filter((c) => c != null && c !== false && c !== true).join('')
  if (type === __Fragment) return text
  if (typeof type === 'function') {
    globalThis.__componentDepth = (globalThis.__componentDepth ?? 0) + 1
    try {
      return type(children.length ? { ...props, children: text } : { ...props })
    } finally {
      globalThis.__componentDepth--
    }
  }
  return '<' + type + '>' + text + '</' + type + '>'
}
`

  afterEach(() => {
    delete (globalThis as { __componentDepth?: number }).__componentDepth
  })

  /**
   * Renders `Page` of `code` in both environments (the client once its chunks
   * have loaded) and records each hook call: its name and the component
   * depth it ran at.
   */
  async function renderHooks(code: string) {
    const render = async (env: 'client' | 'server') => {
      const calls: Array<string> = []
      const hook = (name: string) => () => {
        calls.push(
          `${name}@${(globalThis as { __componentDepth?: number }).__componentDepth ?? 0}`,
        )
        return name
      }
      const stubs: Record<string, ModuleStub> = {
        react: { useId: hook('useId') },
        './hooks': {
          useThing: hook('useThing'),
          useA: hook('useA'),
          useB: hook('useB'),
          useC: hook('useC'),
        },
      }
      const rendered = await renderBoundaries(env, code, (m) => m.Page(), {
        stubs,
        runtime: depthRuntime,
      })
      return { ...rendered, calls }
    }
    return { server: await render('server'), client: await render('client') }
  }

  /**
   * A hook the children call must run in the render of the component around
   * the boundary, like on the server (a hook called from another component
   * on the client breaks the rules of hooks: `useId` mismatches, state is
   * lost). A clear compile error is a valid outcome too.
   */
  async function expectHookCallKeptOrRejected(code: string, hook: string) {
    const results = await compileEnvs(code)
    const messages = rejections(results)
    if (messages.length > 0) {
      expect(messages).toContainEqual(expect.stringMatching(/hook/i))
      return
    }
    const { server, client } = await renderHooks(code)
    expect(server.calls).toEqual([`${hook}@0`])
    expect(client).toEqual(server)
  }

  // Source: hydrate-when-transform.test.ts "rejects hook calls that would be
  // moved into an extracted component", "rejects parenthesized unsafe
  // extraction" (row 2); hydrateWhen HookCall error fixture.
  test.each([
    { name: 'a hook call', call: 'useThing()' },
    { name: 'a parenthesized hook call', call: '(useThing)()' },
  ])(
    '$name in the children runs in the parent render, or is rejected clearly',
    async ({ call }) => {
      await expectHookCallKeptOrRejected(
        `${head}import { useThing } from './hooks'
export function Page() {
  return <Hydrate><p>{${call}}</p></Hydrate>
}`,
        'useThing',
      )
    },
  )

  // The props of the boundary itself are not its children: they render in
  // the parent on both sides, so a hook call there does not stop the split.
  test('a hook call in the props of the boundary runs in the parent render, and the children still split', async () => {
    const code = `${head}import { useThing } from './hooks'
export function Page() {
  return <Hydrate when={useThing()}><p>child</p></Hydrate>
}`
    const { server, client } = await renderHooks(code)
    expect(server.calls).toEqual(['useThing@0'])
    expect(client).toEqual(server)
    const { module, lazyChunks } = await loadClientModule(code, {
      stubs: { './hooks': { useThing: () => 'idle' } },
    })
    expect(module.Page()).toBe('[<p>child</p>]')
    expectRenderedThroughChunks(lazyChunks)
  })

  // Bug: hook calls are only detected when the callee is a bare identifier,
  // so `React.useId()` and `useId?.()` in the children move into the chunk
  // component.
  // Impact: the hook runs in another component on the client than on the
  // server (`useId` mismatches, hydration errors).
  // Source: Qwik optimizer example_use_optimization (known-bugs-hydrate.test.ts;
  // #8504 hydrate-split-modules.test.ts "an optional hook call in the
  // children is rejected", red on main)
  test.fails.each([
    {
      name: 'a hook called through a namespace',
      code: `import * as React from 'react'
${head}export function Page() {
  return <Hydrate><p id={React.useId()}>x</p></Hydrate>
}`,
    },
    {
      name: 'an optional hook call',
      code: `import { useId } from 'react'
${head}export function Page() {
  return <Hydrate><p id={useId?.()}>x</p></Hydrate>
}`,
    },
  ])(
    '$name in the children runs in the parent render, or is rejected clearly',
    async ({ code }) => {
      await expectHookCallKeptOrRejected(code, 'useId')
    },
  )

  // Goal: hooks the children call are supported: they run in the parent's
  // render, in source order with the parent's own hooks, and the chunk
  // receives their values. Today they are rejected.
  test.fails(
    "hooks in the children run in the parent's render, in source order",
    async () => {
      const code = `${head}import { useA, useB, useC } from './hooks'
export function Page() {
  return <>{useA()}<Hydrate><p>{useB()}</p></Hydrate>{useC()}</>
}`
      const { server, client } = await renderHooks(code)
      expect(server.calls).toEqual(['useA@0', 'useB@0', 'useC@0'])
      expect(client).toEqual(server)
      // The children are still split.
      const hook = (name: string) => () => name
      const { module, lazyChunks } = await loadClientModule(code, {
        stubs: {
          './hooks': {
            useA: hook('useA'),
            useB: hook('useB'),
            useC: hook('useC'),
          },
        },
      })
      expect(module.Page()).toBe('useA[<p>useB</p>]useC')
      expectRenderedThroughChunks(lazyChunks)
    },
  )
})

describe('this and super in the children', () => {
  const thisPage = `${head}import { idle } from '@tanstack/react-start/hydration'
export class Page {
  title = 'this'
  render() {
    return (
      <Hydrate when={idle()}>
        <p>{this.title}</p>
      </Hydrate>
    )
  }
}`
  // `title` is a getter: a class field would be an own property of the
  // instance, which `super.title` does not read.
  const superPage = `${head}import { idle } from '@tanstack/react-start/hydration'
class Base {
  get title() {
    return 'super'
  }
}
export class Page extends Base {
  render() {
    return (
      <Hydrate when={idle()}>
        <p>{super.title}</p>
      </Hydrate>
    )
  }
}`
  const render = (module: Record<string, any>) => new module.Page().render()

  // Source: hydrateWhen ThisCapture and SuperCapture error fixtures (the
  // super fixture read a class field, which renders undefined).
  test.each([
    { name: 'this', code: thisPage },
    { name: 'super', code: superPage },
  ])(
    'the children reading $name render like on the server, or are rejected clearly',
    async ({ name, code }) => {
      const messages = rejections(await compileEnvs(code))
      if (messages.length > 0) {
        // The message names what the children read; the function-as-children
        // rejection (which mentions "this boundary") does not count.
        expect(
          messages.filter(
            (message) =>
              new RegExp(`\\b${name}\\b`).test(message) &&
              !/\bfunction\b/i.test(message),
          ),
        ).not.toEqual([])
        return
      }
      expect(await renderBoundaries('client', code, render)).toEqual(
        await renderBoundaries('server', code, render),
      )
    },
  )

  // Goal: `this` and `super` reads are values the parent can pass to the
  // chunk, so such children split. Today they are rejected.
  test.fails.each([
    { name: 'this', code: thisPage, html: '[<p>this</p>]' },
    { name: 'super', code: superPage, html: '[<p>super</p>]' },
  ])(
    'the children reading $name render through the chunk',
    async ({ code, html }) => {
      const { module, lazyChunks } = await loadClientModule(code)
      expect(render(module)).toBe(html)
      expect(lazyChunks.map((chunk) => chunk.rendered)).toEqual([true])
    },
  )
})

describe('nested boundaries', () => {
  // Source: hydrate-when-transform.test.ts "supports nested Hydrate
  // boundaries in extracted virtual modules", "keeps sibling boundary ids
  // stable after nested boundaries"; hydrateWhen.test.ts "should extract
  // virtual modules and keep nested ids stable" and the Nested fixture
  // (gap H6).
  test('a nested boundary and a later sibling hydrate with the ids the server renders', async () => {
    const code = `${head}import { idle, interaction, visible } from '@tanstack/react-start/hydration'
import { NestedButton, Outer, Sibling } from './widgets'
export function Page() {
  return (
    <>
      <Hydrate when={visible()}>
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
}`
    const stubs = {
      './widgets': {
        Outer: () => '<section>Outer</section>',
        NestedButton: () => '<button>Nested</button>',
        Sibling: () => '<aside>Sibling</aside>',
      },
    }
    const render = (module: Record<string, any>) => module.Page()
    const server = await renderBoundaries('server', code, render, { stubs })
    expect(server.html).toBe(
      '[<section>Outer</section>[<button>Nested</button>]][<aside>Sibling</aside>]',
    )
    expect(new Set(server.ids).size).toBe(3)
    expect(await renderBoundaries('client', code, render, { stubs })).toEqual(
      server,
    )
    // Every lazy chunk the client creates renders.
    const { module, lazyChunks } = await loadClientModule(code, { stubs })
    render(module)
    expect(lazyChunks.length).toBeGreaterThan(0)
    expect(lazyChunks.filter((chunk) => !chunk.rendered)).toEqual([])
  })
})

describe('which elements are boundaries', () => {
  // Source: hydrateWhen Renamed fixture (gap H11)
  test('a renamed import of Hydrate is a boundary', async () => {
    const code = `import { Hydrate as HW } from '@tanstack/react-start'
import { interaction } from '@tanstack/react-start/hydration'
import { SearchBox } from './search'
export function Page() {
  return (
    <HW when={interaction({ events: 'focusin' })}>
      <SearchBox />
    </HW>
  )
}`
    const events: Array<string> = []
    const stubs = {
      './search': {
        get SearchBox() {
          events.push('search linked')
          return () => '<input></input>'
        },
      },
    }
    const render = (module: Record<string, any>) => module.Page()
    const server = await renderBoundaries('server', code, render, { stubs })
    expect(server).toEqual({ html: '[<input></input>]', ids: [server.ids[0]] })
    expect(server.ids[0]).toBeDefined()
    events.length = 0
    const { module, lazyChunks } = await loadClientModule(code, {
      stubs,
      beforeChunksLoad: () => events.push('chunks load'),
    })
    expect(events).toEqual(['chunks load', 'search linked'])
    expect(module.Page()).toBe('[<input></input>]')
    expect(lazyChunks.map((chunk) => chunk.rendered)).toEqual([true])
    expect(await renderBoundaries('client', code, render, { stubs })).toEqual(
      server,
    )
  })

  describe('elements that are not the Start Hydrate', () => {
    afterEach(() => {
      delete (globalThis as { Hydrate?: unknown }).Hydrate
      delete (globalThis as { visible?: unknown }).visible
    })

    // Source: hydrateWhen NoImport, NotFromTanstack and WrongImportName
    // fixtures (gap H12)
    test.each([
      {
        name: 'a global Hydrate',
        code: `export function Page() {
  return (
    <Hydrate when={visible()}>
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
    <Hydrate when={visible()}>
      <p>No transform</p>
    </Hydrate>
  )
}`,
        stubs: { 'not-tanstack-start': 'Hydrate' },
        global: false,
      },
      {
        name: 'another export of @tanstack/react-start imported as Hydrate',
        code: `import { Link as Hydrate } from '@tanstack/react-start'
export function Page() {
  return (
    <Hydrate to="/about">
      <p>No transform</p>
    </Hydrate>
  )
}`,
        stubs: { '@tanstack/react-start': 'Link' },
        global: false,
      },
    ])('$name is left alone', async ({ code, stubs, global }) => {
      const received: Array<Record<string, unknown>> = []
      const Foreign = (props: Record<string, unknown>) => {
        received.push(props)
        return `{${props.children ?? ''}}`
      }
      const moduleStubs: Record<string, ModuleStub> = {}
      for (const [specifier, name] of Object.entries(stubs)) {
        moduleStubs[specifier] = { [name]: Foreign }
      }
      if (global) {
        Object.assign(globalThis, { Hydrate: Foreign, visible: () => 'v' })
      }
      for (const env of ['client', 'server'] as const) {
        expect(getChunkIds((await compileHydrate(env, code)).parent)).toEqual(
          [],
        )
      }
      const server = await evaluateModule(
        (await compileHydrate('server', code)).parent,
        { ...hydrateStubs(), ...moduleStubs },
      )
      const client = await loadClientModule(code, { stubs: moduleStubs })
      expect([server.Page(), client.module.Page()]).toEqual([
        '{<p>No transform</p>}',
        '{<p>No transform</p>}',
      ])
      expect(received.map((props) => 'h' in props)).toEqual([false, false])
    })
  })

  // Splitting it is the goal (pinned in known-bugs-hydrate.test.ts); left
  // unsplit, both environments render the same.
  test('a namespace-imported <Start.Hydrate> hydrates like the server renders it', async () => {
    const code = `import * as Start from '@tanstack/react-start'
export function Page() {
  return <Start.Hydrate><p>child</p></Start.Hydrate>
}`
    const render = (module: Record<string, any>) => module.Page()
    const server = await renderBoundaries('server', code, render)
    expect(server.html).toBe('[<p>child</p>]')
    expect(await renderBoundaries('client', code, render)).toEqual(server)
  })

  // Source: hydrate-when-transform.test.ts "uses the Solid Router import
  // source for Solid Hydrate boundaries" (gap H22). A Solid module graph has
  // no React packages: importing one fails to link.
  test('Solid: a Hydrate of @tanstack/solid-start splits with the Solid packages', async () => {
    const { module, lazyChunks } = await loadClientModule(
      `import { Hydrate } from '@tanstack/solid-start'
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
}`,
      { framework: 'solid' },
    )
    expect(module.Page()).toBe('[<p>Hello</p>]')
    expect(lazyChunks.map((chunk) => chunk.rendered)).toEqual([true])
  })
})

// Rsbuild loads a chunk with the code of its source file, and may do so
// before the edited parent module is compiled again: the chunk renders the
// edited children. (Vite loads the source module first; dev servers of both
// in hydrate-build.test.ts.)
// Source: hydrate-when-transform.test.ts "invalidates cached Hydrate source
// for virtual module loads" (the compiler half of gaps H21 / DV42)
test('client: a chunk loaded with the edited source before the parent is compiled again renders the new children', async () => {
  const plugin = createHydrateCompilerPlugin()
  const { compile } = createStartCompiler({
    env: 'client',
    compilerPlugins: [plugin],
  })
  const source = (text: string) => `${head}export function Page() {
  return <Hydrate><p>${text}</p></Hydrate>
}`
  const [id] = getChunkIds((await compile(source('Old')))!)
  const load = (code?: string) =>
    plugin.loadVirtualModule!({
      id: id!,
      code,
      root: '/test',
      env: 'client',
      envName: 'client',
    })!.code
  expect(await renderChunk(load())).toBe('<p>Old</p>')
  expect(await renderChunk(load(source('New')))).toBe('<p>New</p>')
})

// Vite loads a chunk without the source code: when the plugin has no source
// for it (`MissingHydrateSourceError`), the host loads the source module
// again, then the chunk. Once the edited file is invalidated, a chunk loaded
// before the parent is compiled again renders the new children.
test('client: a chunk loaded after its source module was invalidated renders the edited children', async () => {
  const plugin = createHydrateCompilerPlugin()
  const { compiler, compile } = createStartCompiler({
    env: 'client',
    compilerPlugins: [plugin],
  })
  const source = (text: string) => `${head}export function Page() {
  return <Hydrate><p>${text}</p></Hydrate>
}`
  const [id] = getChunkIds((await compile(source('Old')))!)
  const load = () =>
    plugin.loadVirtualModule!({
      id: id!,
      root: '/test',
      env: 'client',
      envName: 'client',
    })!.code
  expect(await renderChunk(load())).toBe('<p>Old</p>')
  compiler.invalidateModule('/test/src/module.tsx')
  /** Loads the chunk like the Vite host does. */
  const loadLikeVite = async () => {
    try {
      return load()
    } catch (error) {
      if (!(error instanceof MissingHydrateSourceError)) {
        throw error
      }
    }
    await compile(source('New'))
    return load()
  }
  expect(await renderChunk(await loadLikeVite())).toBe('<p>New</p>')
})
