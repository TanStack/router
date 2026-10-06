/**
 * Scenarios ported from Next.js's SSG transform fixtures
 * (vercel/next.js `crates/next-custom-transforms/tests/fixture/ssg`, MIT).
 * Next.js removes `getStaticProps`/`getServerSideProps` and prunes everything
 * only they used; here a split route option plays the removed export and the
 * reference module plays the page that keeps the rest.
 */
import { describe, expect, it } from 'vitest'
import { compileRouteModules, expectValidModules } from './regression-helpers'
import { declarationOf } from './validate-module'

const head = `import { createFileRoute } from '@tanstack/react-router'\n`

describe('ported Next.js SSG fixtures: references', () => {
  // Source: ssg/getStaticProps/should-not-remove-import-used-in-render
  it('keeps imports used in JSX positions with the split component', async () => {
    const { modules } =
      compileRouteModules(`${head}import { useState, useEffect } from 'react'
import {
  Root,
  Children,
  JSXMemberExpression,
  AttributeValue,
  AttributeJSX,
  ValueInRender,
  ValueInEffect,
  UnusedInRender,
} from './ui'
function Test() {
  const [x, setX] = useState(ValueInRender.value)
  useEffect(() => {
    setX(ValueInEffect.value)
  }, [])
  return (
    <Root x={x}>
      <Children attr={AttributeValue} jsx={<AttributeJSX />} />
      <JSXMemberExpression.Deep.Property />
    </Root>
  )
}
export const Route = createFileRoute('/')({
  loader: () => [Root, Children, JSXMemberExpression, AttributeValue, AttributeJSX, ValueInRender, ValueInEffect, UnusedInRender],
  component: Test,
})
`)
    const component = modules['virtual component']!
    for (const name of [
      'Root',
      'Children',
      'JSXMemberExpression',
      'AttributeValue',
      'AttributeJSX',
      'ValueInRender',
      'ValueInEffect',
      'useState',
      'useEffect',
    ]) {
      expect(component).toMatch(
        new RegExp(String.raw`import \{[^}]*\b${name}\b`),
      )
    }
    expect(component).not.toContain('UnusedInRender')
    expect(modules.reference).toContain('UnusedInRender')
    expect(modules.reference).not.toMatch(/from ['"]react['"]/)
    await expectValidModules(modules)
  })

  // Source: ssg/getStaticProps/should-not-remove-import-used-in-render
  it('does not treat JSX tag or attribute names as references to module bindings', async () => {
    const { modules, sharedBindings } =
      compileRouteModules(`${head}import { Comp } from './comp'
import { load } from './load'
const a = load()
const div = 'div'
const label = load()
export const Route = createFileRoute('/')({
  loader: () => [a, div, label],
  component: () => (
    <div>
      <a href="/">home</a>
      <Comp label="static" />
    </div>
  ),
})
`)
    expect(sharedBindings).toEqual([])
    expect(modules['virtual component']).not.toContain('./load')
    expect(modules['virtual component']).toMatch(
      /import \{ Comp \} from ['"]\.\/comp['"]/,
    )
    expect(modules.reference).toMatch(declarationOf('a'))
    expect(modules.reference).toMatch(declarationOf('label'))
    await expectValidModules(modules)
  })

  // Source: ssg/getStaticProps/should-not-mix-up-bindings and
  // ssg/getServerSideProps/query-usage
  it.each([
    {
      name: 'locals and function names in the split component',
      code: `${head}import { fetchLabel } from './api'
const label = fetchLabel()
function bug() {
  return 1
}
export const Route = createFileRoute('/')({
  loader: () => [label, bug()],
  component: () => {
    const label = 'local'
    const obj = { a: function bug(x: number) { return x } }
    function inner() {
      var bug = 2
      return bug
    }
    return <div>{label}{obj.a(inner())}</div>
  },
})
`,
      chunkExcludes: ['./api', 'fetchLabel'],
      referenceIncludes: ['fetchLabel()'],
    },
    {
      name: 'a local in the loader',
      code: `${head}import { fetchLabel } from './api'
const label = fetchLabel()
export const Route = createFileRoute('/')({
  loader: ({ params }: any) => {
    const label = params.id
    return label
  },
  component: () => <div>{label}</div>,
})
`,
      chunkExcludes: [],
      referenceExcludes: ['./api', 'fetchLabel'],
    },
    {
      name: 'destructured parameters',
      code: `${head}import { load } from './load'
const query = load()
const prop = load()
export const Route = createFileRoute('/')({
  loader: ({ query }: any) => [query.prop, prop],
  component: ({ prop }: any) => <div id="prop">{prop}{String(query)}</div>,
})
`,
      chunkExcludes: ['const prop'],
      referenceExcludes: ['const query'],
    },
    {
      name: 'a catch parameter and a named function expression',
      code: `${head}import { load } from './load'
const error = load()
const Page = function Page() {
  try {
    throw new Error('x')
  } catch (error) {
    return <div>{String(error)}{typeof Page}</div>
  }
}
export const Route = createFileRoute('/')({
  loader: () => error,
  component: Page,
})
`,
      chunkExcludes: ['./load'],
    },
    {
      name: 'a hoisted var in the split component',
      code: `${head}import { load } from './load'
const value = load()
export const Route = createFileRoute('/')({
  loader: () => value,
  component: () => {
    const before = value
    var value = 'local'
    return <div>{String(before)}{value}</div>
  },
})
`,
      chunkExcludes: ['./load'],
    },
  ])(
    'resolves names shadowed by $name',
    async ({ code, chunkExcludes, referenceIncludes, referenceExcludes }) => {
      const { modules, sharedBindings } = compileRouteModules(code)
      expect(sharedBindings).toEqual([])
      for (const text of chunkExcludes) {
        expect(modules['virtual component']).not.toContain(text)
      }
      for (const text of referenceIncludes ?? []) {
        expect(modules.reference).toContain(text)
      }
      for (const text of referenceExcludes ?? []) {
        expect(modules.reference).not.toContain(text)
      }
      await expectValidModules(modules)
    },
  )
})

describe('ported Next.js SSG fixtures: pruning', () => {
  // Source: ssg/getStaticProps/should-remove-re-exported-function-declarations-dependents-variables-functions-imports
  it('prunes every kind of declaration only the split component uses', async () => {
    const { modules, sharedBindings } =
      compileRouteModules(`${head}import keep_me from 'hello'
import { keep_me2 } from 'hello2'
import * as keep_me3 from 'hello3'
import drop_me from 'bla'
import { drop_me2 } from 'foo'
import { drop_me3, but_not_me } from 'bar'
import * as remove_mua from 'hehe'
var leave_me_alone = 1
function dont_bug_me_either() {}
const inceptionVar = 'hahaa'
var var1 = 1
let var2 = 2
const var3 = inceptionVar + remove_mua
function inception1() {
  var2
  drop_me2
}
function abc() {}
const b = function () {
  var3
  drop_me3
}
const b2 = function apples() {}
const bla = () => {
  inception1
}
function Page() {
  abc()
  drop_me
  b
  b2
  bla()
  return <div>{var1}</div>
}
export const Route = createFileRoute('/')({
  loader: () => [keep_me, keep_me2, keep_me3],
  component: Page,
})
`)
    expect(sharedBindings).toEqual([])
    const { reference } = modules
    for (const text of [
      "'bla'",
      "'foo'",
      "'hehe'",
      'drop_me3',
      'inception1',
      'inceptionVar',
      'apples',
      'var1',
      'var2',
      'var3',
    ]) {
      expect(reference).not.toContain(text)
    }
    // Declarations and imports nothing used before splitting stay in place
    expect(reference).toMatch(/import \{ but_not_me \} from ['"]bar['"]/)
    expect(reference).toMatch(declarationOf('leave_me_alone'))
    expect(reference).toMatch(declarationOf('dont_bug_me_either'))
    const component = modules['virtual component']!
    for (const text of ["'hello'", "'hello2'", "'hello3'"]) {
      expect(component).not.toContain(text)
    }
    for (const name of ['inception1', 'abc', 'b', 'b2', 'bla', 'var3']) {
      expect(component).toMatch(declarationOf(name))
    }
    await expectValidModules(modules)
  })

  // Source: ssg/getStaticProps/destructuring-assignment-array and
  // ssg/getStaticProps/destructuring-assignment-object
  it.each([
    {
      name: 'array',
      declarations: `const [a, b, ...rest] = fs.promises
const [foo, bar] = other`,
      loader: 'foo',
      component: '{String(a)}{String(b)}{rest.length}{String(bar)}',
      shared: ['bar', 'foo'],
    },
    {
      name: 'object',
      declarations: `const { readFile, readdir, access: foo } = fs.promises
const { a, b, cat: bar, ...rem } = other`,
      loader: '[a, bar]',
      component:
        '{String(readFile)}{String(readdir)}{String(foo)}{String(b)}{Object.keys(rem).join()}',
      shared: ['a', 'b', 'bar', 'rem'],
    },
  ])(
    'shares one $name destructuring whose bindings the loader and the component split',
    async ({ declarations, loader, component, shared }) => {
      const { modules, sharedBindings } =
        compileRouteModules(`${head}import fs from 'fs'
import other from 'other'
${declarations}
export const Route = createFileRoute('/')({
  loader: () => ${loader},
  component: () => <div>${component}</div>,
})
`)
      expect(sharedBindings).toEqual(shared)
      expect(modules.shared).toMatch(/\} = other;|\] = other;/)
      expect(modules.shared).not.toContain('fs.promises')
      expect(modules.reference).not.toContain('other')
      expect(modules.reference).not.toMatch(/from ['"]fs['"]/)
      expect(modules['virtual component']).toContain('= fs.promises')
      expect(modules['virtual component']).not.toContain('= other')
      await expectValidModules(modules)
    },
  )

  // Source: ssg/getStaticProps/issue-30091
  it('keeps a dynamic import inside the split component out of the reference module', async () => {
    const { modules } =
      compileRouteModules(`${head}export const Route = createFileRoute('/')({
  loader: async () => (await import('./server-data')).load(),
  component: () => {
    import('./analytics').then((m) => m.track())
    return <div>home</div>
  },
})
`)
    expect(modules.reference).not.toContain('./analytics')
    expect(modules.reference).toContain('./server-data')
    expect(modules['virtual component']).toContain('./analytics')
    expect(modules['virtual component']).not.toContain('./server-data')
    await expectValidModules(modules)
  })

  // Source: ssg/getStaticProps/issue-31855 and
  // ssg/getStaticProps/multi-declarator-export
  it('imports exported declarators the split component reads from the reference module', async () => {
    const { modules } =
      compileRouteModules(`${head}export const revalidateInSeconds = 5 * 60
export const a = 1,
  b = 2
export const Route = createFileRoute('/')({
  component: () => <div>{revalidateInSeconds + a + b}</div>,
})
`)
    expect(modules.reference).toMatch(/export const revalidateInSeconds\b/)
    expect(modules.reference).toMatch(/export const a = 1,\s*b = 2/)
    const component = modules['virtual component']!
    for (const name of ['revalidateInSeconds', 'a', 'b']) {
      expect(component).toMatch(
        new RegExp(
          String.raw`import \{[^}]*\b${name}\b[^}]*\} from ['"]route\.tsx['"]`,
        ),
      )
      expect(component).not.toMatch(declarationOf(name))
    }
    await expectValidModules(modules)
  })

  // Source: ssg/getStaticProps/should-remove-re-exported-variable-declarations-safe
  // is covered by `ported-react-router-route-chunks.test.ts` ("moves plain
  // declarators sharing a statement into their own modules").

  // Source: ssg/getStaticProps/should-support-babel-style-memoized-function
  it.each([
    { name: 'the component', loader: `'data'`, shared: [] },
    {
      name: 'the loader and the component',
      loader: 'fetchData()',
      shared: ['fetchData'],
    },
  ])(
    'keeps a self-reassigning function used by $name valid',
    async ({ loader, shared }) => {
      const { modules, sharedBindings } =
        compileRouteModules(`${head}function fetchData() {
  fetchData = function () {
    return 'memoized'
  }
  return fetchData.apply(this, arguments as any)
}
export const Route = createFileRoute('/')({
  loader: () => ${loader},
  component: () => <div>{fetchData()}</div>,
})
`)
      expect(sharedBindings).toEqual(shared)
      const owner = shared.length
        ? modules.shared!
        : modules['virtual component']!
      expect(owner).toMatch(declarationOf('fetchData'))
      expect(owner).toContain('fetchData = function')
      await expectValidModules(modules)
    },
  )
})
