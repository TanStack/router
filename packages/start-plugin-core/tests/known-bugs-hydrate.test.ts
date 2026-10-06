/**
 * Known `<Hydrate>` split-transform bugs, pinned as expected failures.
 *
 * Every `.fails` test asserts the CORRECT behaviour and is marked `.fails`
 * because the compiler does not implement it yet. When a fix lands, the test
 * starts passing, Vitest reports the `.fails` test as failed, and the `.fails`
 * modifier must be removed.
 *
 * Several bugs were found by porting other compilers' test suites (all MIT):
 * - the Qwik optimizer tests (QwikDev/qwik
 *   `packages/optimizer/core/src/test.rs`);
 * - SolidStart's `"use server"` directive checks (solidjs/solid-start
 *   `packages/start/src/directives`, `validate.ts` and `compile.spec.ts`);
 * - the React Compiler fixture corpus (facebook/react
 *   `compiler/packages/babel-plugin-react-compiler/src/__tests__/fixtures/compiler`).
 * Each ported test names its source.
 */
import { parseSync } from 'vite'
import { describe, expect, test } from 'vitest'
import { compileHydrate, getChunkIds, renderChunk } from './known-bugs-helpers'
import { getModuleErrors } from './validate-module'

type JsxNode = {
  type: string
  name?: { type: string; name?: string }
  openingElement?: {
    name: { type: string; name?: string }
    attributes: Array<{
      type: string
      name?: { name: string }
      value?: { type: string; expression?: { type: string; name?: string } }
    }>
  }
  expression?: JsxNode
  children?: Array<JsxNode & { value?: string }>
}

/** Finds the JSX elements named `name` in a module (Oxc ESTree), in order. */
function findJsxElements(code: string, name: string): Array<JsxNode> {
  const { program } = parseSync('module.tsx', code, { sourceType: 'module' })
  const found: Array<JsxNode> = []
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') {
      return
    }
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }
    const current = node as JsxNode
    if (
      current.type === 'JSXElement' &&
      current.openingElement?.name.name === name
    ) {
      found.push(current)
    }
    Object.values(node).forEach(visit)
  }
  visit(program)
  return found
}

/** Children that render something: no whitespace text, no `{}` or comments. */
function renderedChildren(element: JsxNode) {
  return (element.children ?? []).filter(
    (child) =>
      !(child.type === 'JSXText' && child.value!.trim() === '') &&
      !(
        child.type === 'JSXExpressionContainer' &&
        child.expression?.type === 'JSXEmptyExpression'
      ),
  )
}

/** Boundary ids (`h` props) a compiled module renders, in source order. */
function getBoundaryIds(code: string) {
  return [...code.matchAll(/\bh=\s*["']([^"']+)["']/g)].map(([, id]) => id!)
}

/** Top-level binding names a module declares, from any declaration form. */
function getDeclaredNames(code: string) {
  const { program } = parseSync('module.tsx', code, { sourceType: 'module' })
  const names = new Set<string>()
  const addPattern = (pattern: any): void => {
    switch (pattern?.type) {
      case 'Identifier':
        names.add(pattern.name)
        return
      case 'ObjectPattern':
        for (const property of pattern.properties) {
          addPattern(
            property.type === 'RestElement'
              ? property.argument
              : property.value,
          )
        }
        return
      case 'ArrayPattern':
        pattern.elements.forEach(addPattern)
        return
      case 'AssignmentPattern':
        addPattern(pattern.left)
        return
      case 'RestElement':
        addPattern(pattern.argument)
        return
    }
  }
  for (const statement of program.body as Array<any>) {
    const declaration =
      statement.type === 'ExportNamedDeclaration' ||
      statement.type === 'ExportDefaultDeclaration'
        ? statement.declaration
        : statement
    if (declaration?.type === 'VariableDeclaration') {
      for (const declarator of declaration.declarations) {
        addPattern(declarator.id)
      }
    } else if (declaration?.id?.name) {
      names.add(declaration.id.name)
    }
  }
  return names
}

describe('known Hydrate split bugs: boundaries and ids', () => {
  // Control for the bugs below: sibling boundaries get the same ids on the
  // server and the client, and each id loads the chunk with its children.
  test('sibling boundaries load their own chunks under the server ids', async () => {
    const code = `import { Hydrate } from '@tanstack/react-start'
export function Page() {
  return <div>
    <Hydrate><p>first</p></Hydrate>
    <Hydrate><p>second</p></Hydrate>
  </div>
}`
    const server = await compileHydrate('server', code)
    const client = await compileHydrate('client', code)
    const serverIds = getBoundaryIds(server.parent!)
    expect(serverIds).toHaveLength(2)
    expect(getBoundaryIds(client.parent!)).toEqual(serverIds)
    const rendered: Array<unknown> = []
    for (const id of serverIds) {
      const chunkId = client.chunkIds.find((chunk) => chunk.endsWith(`=${id}`))
      expect(chunkId).toBeDefined()
      rendered.push(await renderChunk(client.loadChunk(chunkId!)))
    }
    expect(rendered).toEqual(['<p>first</p>', '<p>second</p>'])
  })

  // Bug: the server strips `fallback` (and any Hydrate inside it) before
  // numbering boundaries, the client numbers boundaries without visiting the
  // fallback, but the virtual-module loader walk counts the Hydrate inside the
  // fallback. The ids stay aligned between server and client, but the chunk
  // loaded for the next boundary contains the fallback's children. Impact: a
  // later boundary hydrates with the wrong content. Remove `.fails` once fixed.
  test.fails(
    'a Hydrate inside a fallback does not shift the chunks of later boundaries',
    async () => {
      const code = `import { Hydrate } from '@tanstack/react-start'
export function Page() {
  return <div>
    <Hydrate fallback={<Hydrate><p>inner</p></Hydrate>}><p>outer</p></Hydrate>
    <Hydrate><p>second</p></Hydrate>
  </div>
}`
      const server = await compileHydrate('server', code)
      const client = await compileHydrate('client', code)
      const serverIds = getBoundaryIds(server.parent!)
      expect(serverIds).toHaveLength(2)
      // The client renders the same two boundaries with the same ids.
      expect(getBoundaryIds(client.parent!)).toEqual(
        expect.arrayContaining(serverIds),
      )
      const rendered: Array<unknown> = []
      for (const id of serverIds) {
        const chunkId = client.chunkIds.find((chunk) =>
          chunk.endsWith(`=${id}`),
        )
        expect(chunkId).toBeDefined()
        rendered.push(await renderChunk(client.loadChunk(chunkId!)))
      }
      expect(rendered).toEqual(['<p>outer</p>', '<p>second</p>'])
    },
  )

  // Bug: a component that renders itself (or a component that renders it)
  // inside its own boundary is copied into the chunk together with that
  // boundary. Compiling the chunk numbers the copy after the chunk's own
  // index, so it renders a boundary id the server never emitted, and its lazy
  // import points at a boundary that does not exist in the source. Impact:
  // nested boundaries of recursive components (trees, threads) do not match
  // the server ids and their chunks fail to load. Remove `.fails` once fixed.
  // Qwik: root_level_self_referential_qrl,
  // example_self_referential_component_migration
  test.fails.each([
    {
      name: 'a self-recursive component',
      code: `import { Hydrate } from '@tanstack/react-start'
export function Tree({ node }) {
  return <li>{node.label}<Hydrate><ul>{node.children.map((child) => <Tree node={child} />)}</ul></Hydrate></li>
}
`,
    },
    {
      name: 'mutually recursive components',
      code: `import { Hydrate } from '@tanstack/react-start'
function Branch({ depth }) { return depth ? <Leaf depth={depth - 1} /> : null }
export function Leaf({ depth }) {
  return <Hydrate><Branch depth={depth} /></Hydrate>
}
`,
    },
  ])(
    'client: $name keeps boundary ids aligned with the server',
    async ({ code }) => {
      const server = await compileHydrate('server', code)
      const serverIds = new Set(getBoundaryIds(server.parent!))
      const { parent, chunkIds, chunks, compileChunk, loadChunk } =
        await compileHydrate('client', code)
      expect(chunks).toHaveLength(1)
      // The bundler compiles the loaded chunk like any other module.
      const chunk = (await compileChunk(chunkIds[0]!)) ?? chunks[0]!
      expect(await getModuleErrors(chunk)).toEqual([])
      for (const id of [...getBoundaryIds(parent!), ...getBoundaryIds(chunk)]) {
        expect(serverIds).toContain(id)
      }
      for (const id of getChunkIds(chunk)) {
        expect(() => loadChunk(id)).not.toThrow()
      }
    },
  )

  // Bug: only named `Hydrate` imports are recognized; `<Start.Hydrate>` from
  // `import * as Start from '@tanstack/react-start'` is left untransformed.
  // Impact: the boundary gets no id and its children are not split.
  // Remove `.fails` once fixed.
  test.fails(
    'a namespace-imported <Start.Hydrate> is transformed',
    async () => {
      const { parent, chunkIds } = await compileHydrate(
        'client',
        `import * as Start from '@tanstack/react-start'
export function Page() {
  return <Start.Hydrate><p>child</p></Start.Hydrate>
}`,
      )
      expect(parent).not.toBeNull()
      expect(parent).toMatch(/\bh="/)
      expect(chunkIds).toHaveLength(1)
    },
  )

  // Bug: JSX elements are matched by name only, so a local component that
  // shadows the imported `Hydrate` is split and given a boundary id too.
  // Impact: the local component's children are replaced by a lazy chunk.
  // Remove `.fails` once fixed.
  test.fails('a local binding shadowing Hydrate is left alone', async () => {
    const { parent, chunkIds } = await compileHydrate(
      'client',
      `import { Hydrate } from '@tanstack/react-start'
export function Page() {
  return <Hydrate><p>real</p></Hydrate>
}
export function Local() {
  const Hydrate = (props: { children: unknown }) => props.children
  return <Hydrate><p>local</p></Hydrate>
}`,
    )
    expect(chunkIds).toHaveLength(1)
    expect(parent).toContain('<p>local</p>')
  })

  // Bug: a boundary whose only children are comments is still split, and the
  // injected lazy child overrides the `children` passed through a spread.
  // Impact: the spread children are never rendered.
  // Remove `.fails` once fixed.
  test.fails(
    'comment-only children keep the children passed through a spread',
    async () => {
      const { parent } = await compileHydrate(
        'client',
        `import { Hydrate } from '@tanstack/react-start'
export function Page(props: { children: unknown }) {
  return <Hydrate {...props}>{/* filled by props */}</Hydrate>
}`,
      )
      const output =
        parent ?? `<Hydrate {...props}>{/* filled by props */}</Hydrate>`
      const [hydrate] = findJsxElements(output, 'Hydrate')
      expect(renderedChildren(hydrate!)).toEqual([])
    },
  )
})

describe('known Hydrate split bugs: values captured by the children', () => {
  // Control for the bugs below: a local the children read is passed to the
  // chunk component as a prop of the same name.
  test('a captured local reaches the split children', async () => {
    const { chunks } = await compileHydrate(
      'client',
      `import { Hydrate } from '@tanstack/react-start'
export function Page({ title }) {
  return <Hydrate><p>{title}</p></Hydrate>
}`,
    )
    expect(chunks).toHaveLength(1)
    expect(await renderChunk(chunks[0]!, { props: { title: 'Hello' } })).toBe(
      '<p>Hello</p>',
    )
  })

  // Bug: captured locals are passed to the lazy chunk component under their
  // own names, so locals named `key` or `ref` become `key={key}` /
  // `ref={ref}`, which React consumes instead of passing them as props.
  // Impact: the split children render without those values.
  // Remove `.fails` once fixed.
  test.fails(
    'captured locals named key and ref reach the split children',
    async () => {
      const { parent, chunks } = await compileHydrate(
        'client',
        `import { Hydrate } from '@tanstack/react-start'
export function Page() {
  const key = 'k'
  const ref = 'r'
  return <Hydrate><p>{key}{ref}</p></Hydrate>
}`,
      )
      expect(chunks).toHaveLength(1)
      const [hydrate] = findJsxElements(parent!, 'Hydrate')
      const [container] = renderedChildren(hydrate!)
      const lazyElement =
        container?.type === 'JSXExpressionContainer'
          ? container.expression
          : container
      expect(lazyElement?.type).toBe('JSXElement')
      const locals: Record<string, string> = { key: 'k', ref: 'r' }
      const props: Record<string, unknown> = {}
      for (const attribute of lazyElement!.openingElement!.attributes) {
        const name = attribute.name!.name
        // React keeps `key` and `ref` for itself.
        if (name === 'key' || name === 'ref') {
          continue
        }
        props[name] = locals[attribute.value!.expression!.name!]
      }
      expect(await renderChunk(chunks[0]!, { props })).toBe('<p>kr</p>')
    },
  )

  // Bug: split children that read the component's `arguments` are moved
  // into the chunk component unchanged, where `arguments` is the chunk's own
  // (its props are the captured locals, not the component's props). `this`
  // and `super` are rejected for the same reason; `arguments` is not.
  // Impact: the boundary hydrates with different values than the server
  // rendered, silently. Rejecting it at compile time is an acceptable fix.
  // Remove `.fails` once fixed.
  // SolidStart validate.ts: "rejects `arguments` in an arrow inside a function"
  test.fails(
    "split children reading the component's arguments render its props",
    async () => {
      let compiled: Awaited<ReturnType<typeof compileHydrate>>
      try {
        compiled = await compileHydrate(
          'client',
          `import { Hydrate } from '@tanstack/react-start'
export function Page() {
  return <Hydrate><p>{arguments[0].title}</p></Hydrate>
}`,
        )
      } catch {
        return
      }
      expect(compiled.chunks).toHaveLength(1)
      // Evaluate the props the parent passes to the lazy chunk element the
      // way React calls `Page`: with its props as the first argument.
      const attributes = compiled.parent!.match(/<_H0?\b([^>]*?)\/>/)![1]!
      const props = [...attributes.matchAll(/([\w$]+)=\{([^}]*)\}/g)]
        .map(([, name, value]) => `${JSON.stringify(name)}: ${value}`)
        .join(', ')
      const passed = new Function(
        `return function () { return { ${props} } }`,
      )()({ title: 'Hello' })
      expect(await renderChunk(compiled.chunks[0]!, { props: passed })).toBe(
        '<p>Hello</p>',
      )
    },
  )

  // Bug: any `this` inside split children rejects the boundary with
  // "Hydrate cannot code-split JSX that captures this", including a `this`
  // that belongs to a function, class or object method written inside the
  // children, which moves with them and needs no capture. Impact: valid code
  // fails to build. Remove `.fails` once fixed.
  // Sources: Qwik issue_5008 (function-expression callbacks inside the
  // extracted scope); SolidStart compile.spec.ts "allows `this` and
  // `arguments` in a function expression".
  test.fails.each([
    {
      name: 'a function expression',
      children: `<ul>{items.map(function (item) { return <li>{this.prefix + item}</li> }, { prefix: '>' })}</ul>`,
      rendered: '<ul><li>>a</li><li>>b</li></ul>',
    },
    {
      name: 'a class',
      children: `<p>{new (class { label = 'inner'; read() { return this.label } })().read()}</p>`,
      rendered: '<p>inner</p>',
    },
    {
      name: 'an object method',
      children: `<p>{({ label: 'inner', read() { return this.label } }).read()}</p>`,
      rendered: '<p>inner</p>',
    },
  ])(
    'split children may use the own `this` of $name',
    async ({ children, rendered }) => {
      const { parent, chunks } = await compileHydrate(
        'client',
        `import { Hydrate } from '@tanstack/react-start'
export function Page({ items }) {
  return <Hydrate>${children}</Hydrate>
}`,
      )
      expect(await getModuleErrors(parent!)).toEqual([])
      expect(chunks).toHaveLength(1)
      expect(
        await renderChunk(chunks[0]!, { props: { items: ['a', 'b'] } }),
      ).toBe(rendered)
    },
  )

  // Bug: hook calls are only detected when the callee is a bare identifier, so
  // `React.useId()` in the children is moved into the chunk component instead
  // of being rejected. Impact: the hook runs in a different component on the
  // client than on the server (e.g. `useId` returns a different id, so
  // hydration mismatches). Remove `.fails` once fixed.
  // Qwik: example_use_optimization (use* calls inside the extracted scope)
  test.fails(
    'client: a hook called through a namespace in the children is rejected',
    async () => {
      await expect(
        compileHydrate(
          'client',
          `import * as React from 'react'
import { Hydrate } from '@tanstack/react-start'
export function Page() {
  return <Hydrate><p id={React.useId()}>x</p></Hydrate>
}
`,
        ),
      ).rejects.toThrow(/hook/i)
    },
  )

  // Bug: split children containing `await` (async server components) are
  // moved into a synchronous chunk component. Impact: the chunk is not a
  // valid module and the build fails. A clear compile-time error is an
  // acceptable fix too. Remove `.fails` once fixed.
  test.fails(
    'await in split children never produces a broken chunk',
    async () => {
      let compiled: Awaited<ReturnType<typeof compileHydrate>>
      try {
        compiled = await compileHydrate(
          'client',
          `import { Hydrate } from '@tanstack/react-start'
import { load } from './data'
export async function Page() {
  return <Hydrate><p>{await load()}</p></Hydrate>
}`,
        )
      } catch {
        return
      }
      for (const chunk of compiled.chunks) {
        expect(await getModuleErrors(chunk)).toEqual([])
      }
    },
  )
})

describe('known Hydrate split bugs: module-level code used by the children', () => {
  // Control for the bugs below: a module-level helper component the children
  // render is available in the chunk.
  test('a module-level helper component renders in the chunk', async () => {
    const { chunks } = await compileHydrate(
      'client',
      `import { Hydrate } from '@tanstack/react-start'
function Label() { return <b>label</b> }
export function Page() {
  return <Hydrate><p><Label /></p></Hydrate>
}`,
    )
    expect(chunks).toHaveLength(1)
    expect(await getModuleErrors(chunks[0]!)).toEqual([])
    expect(await renderChunk(chunks[0]!)).toBe('<p><b>label</b></p>')
  })

  // Bug: module-level declarations used by the split children are copied into
  // the chunk instead of being shared with the parent module, so the chunk
  // has its own instance. Impact: a context created in the route file is a
  // different object in the chunk, so children reading it ignore the parent's
  // Provider and render the default value; a `let` the parent reassigns is
  // always read with its initial value. Remove `.fails` once fixed.
  test.fails.each([
    {
      name: 'a context',
      // Qwik: should_keep_module_level_var_used_in_both_main_and_qrl
      code: `import { createContext, useContext } from 'react'
import { Hydrate } from '@tanstack/react-start'
const Theme = createContext('light')
function Label() { return <span>{useContext(Theme)}</span> }
export function Page() {
  return <Theme.Provider value="dark"><Hydrate><Label /></Hydrate></Theme.Provider>
}
`,
      binding: 'Theme',
    },
    {
      name: 'a let reassigned by the parent',
      // Qwik: should_auto_export_shared_let_kept_in_parent
      code: `import { Hydrate } from '@tanstack/react-start'
let clicks = 0
export function bump() { clicks++ }
export function Page() {
  return <Hydrate><p>{clicks}</p></Hydrate>
}
`,
      binding: 'clicks',
    },
  ])(
    'client: $name declared at module level is not re-declared by the chunk',
    async ({ code, binding }) => {
      const { chunks } = await compileHydrate('client', code)
      expect(chunks).toHaveLength(1)
      expect(await getModuleErrors(chunks[0]!)).toEqual([])
      expect(getDeclaredNames(chunks[0]!).has(binding)).toBe(false)
    },
  )

  // Bug: only declarations are moved into the chunk; top-level statements that
  // complete them (member assignments, registrations) are dropped. Impact:
  // compound components such as `<Card.Title />` are undefined in the chunk
  // and React throws "Element type is invalid"; registries are empty.
  // Remove `.fails` once fixed.
  // Qwik: should_not_move_over_side_effects, example_drop_side_effects
  test.fails.each([
    {
      name: 'a compound component member assignment',
      setup: `function Card({ children }) { return <div>{children}</div> }
Card.Title = function Title() { return <h1>t</h1> }`,
      children: '<Card><Card.Title /></Card>',
      rendered: '<div><h1>t</h1></div>',
    },
    {
      name: 'Object.assign on a component',
      setup: `function Tabs({ children }) { return <ul>{children}</ul> }
Object.assign(Tabs, { Tab: () => <li>tab</li> })`,
      children: '<Tabs><Tabs.Tab /></Tabs>',
      rendered: '<ul><li>tab</li></ul>',
    },
    {
      name: 'a registry filled by a top-level call',
      setup: `const registry = new Map()
registry.set('a', 'A')`,
      children: `<p>{registry.get('a')}</p>`,
      rendered: '<p>A</p>',
    },
  ])(
    'client: $name that the children rely on reaches the chunk',
    async ({ setup, children, rendered }) => {
      const { chunks } = await compileHydrate(
        'client',
        `import { Hydrate } from '@tanstack/react-start'
${setup}
export function Page() {
  return <Hydrate>${children}</Hydrate>
}
`,
      )
      expect(await getModuleErrors(chunks[0]!)).toEqual([])
      expect(await renderChunk(chunks[0]!)).toBe(rendered)
    },
  )

  // Bug: a TypeScript import alias (`import Card = ui.Card`) used only by the
  // split children is not declared in the client chunk. Main keeps
  // `import * as ui` in the parent and drops the alias; the Yuku PR keeps the
  // alias in the parent but drops the `ui` import it reads. Impact: the chunk
  // throws "Card is not defined" when the boundary hydrates.
  // Remove `.fails` once fixed.
  // React Compiler fixture: ts-import-equals-declaration.ts
  test.fails(
    'client: a TypeScript import alias used by the split children is declared in the chunk',
    async () => {
      const { chunks } = await compileHydrate(
        'client',
        `import { Hydrate } from '@tanstack/react-start'
import { visible } from '@tanstack/react-start/hydration'
import * as ui from './ui'
import Card = ui.Card

function Panel() {
  return <Card title="hi" />
}

export function Page() {
  return (
    <Hydrate when={visible()}>
      <Panel />
    </Hydrate>
  )
}
`,
      )
      expect(chunks).toHaveLength(1)
      expect(
        await renderChunk(chunks[0]!, {
          imports: {
            './ui': `export const Card = (props) => '<b>' + props.title + '</b>'`,
          },
        }),
      ).toBe('<b>hi</b>')
    },
  )

  // Bug: children that read the module's `Route` are moved into a chunk that
  // neither imports, declares nor receives `Route`. Impact: rendering the
  // boundary throws `ReferenceError: Route is not defined`. A clear
  // compile-time error is an acceptable fix too. Remove `.fails` once fixed.
  test.fails(
    'Route referenced in split children is bound in the chunk',
    async () => {
      let compiled: Awaited<ReturnType<typeof compileHydrate>>
      try {
        compiled = await compileHydrate(
          'client',
          `import { Hydrate } from '@tanstack/react-start'
import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: Page })
function Page() {
  return <Hydrate><p>{Route.id}</p></Hydrate>
}`,
        )
      } catch {
        return
      }
      expect(compiled.chunks).toHaveLength(1)
      expect(compiled.chunks[0]).toMatch(
        /\bimport\b[^;]*\bRoute\b[^;]*\bfrom\b|\b(?:const|let|var|function|class)\s+Route\b|export function \w+\(\{[^}]*\bRoute\b/,
      )
    },
  )

  // Bug: module-level helpers used only by the split children move into the
  // chunk, where a helper named like the generated export (`H0`) collides
  // with it. Impact: the chunk is not a valid module and the build fails.
  // Remove `.fails` once fixed.
  test.fails(
    'a helper named like the generated chunk export does not collide',
    async () => {
      const { chunks } = await compileHydrate(
        'client',
        `import { Hydrate } from '@tanstack/react-start'
function H0() { return <b>helper</b> }
export function Page() {
  return <Hydrate><H0 /></Hydrate>
}`,
      )
      expect(chunks).toHaveLength(1)
      expect(await getModuleErrors(chunks[0]!)).toEqual([])
      expect(await renderChunk(chunks[0]!)).toBe('<b>helper</b>')
    },
  )
})
