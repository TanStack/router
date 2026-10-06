/**
 * Known bugs found by porting SolidStart's `"use server"` directive compiler
 * checks (solidjs/solid-start, MIT): packages/start/src/directives
 * (`validate.ts` and `compile.spec.ts`), pinned as expected failures.
 *
 * Every test asserts the CORRECT behaviour and is marked `.fails` because the
 * compiler does not implement it yet. When a fix lands, the test starts
 * passing, Vitest reports the `.fails` test as failed, and the `.fails`
 * modifier must be removed.
 */
import { transformWithOxc } from 'vite'
import { describe, expect, test } from 'vitest'
import { createHydrateCompilerPlugin } from '../src/hydrate-when-transform'
import { compileStartModule } from './compile-start-module'
import { getModuleErrors } from './validate-module'

/** Compiles a module with `<Hydrate>` for the client and loads its chunks. */
async function compileHydrate(code: string) {
  const plugin = createHydrateCompilerPlugin()
  const parent = await compileStartModule({
    env: 'client',
    code,
    compilerPlugins: [plugin],
  })
  expect(parent).not.toBeNull()
  const chunks = [...parent!.matchAll(/import\((["'])(.+?)\1\)/g)].map(
    ([, , id]) =>
      plugin.loadVirtualModule?.({
        id: id!,
        root: '/test',
        env: 'client',
        envName: 'client',
      })?.code ?? '',
  )
  return { parent: parent!, chunks }
}

/** Renders a chunk export to a string: JSX becomes nested tags. */
async function renderChunk(chunk: string, props: Record<string, unknown> = {}) {
  const { code } = await transformWithOxc(chunk, 'chunk.tsx', {
    jsx: { runtime: 'classic', pragma: 'h', pragmaFrag: 'Fragment' },
  })
  const jsx = `const Fragment = Symbol('Fragment')
const h = (type, props, ...children) => {
  const text = children.flat(Infinity).filter((c) => c != null && c !== false).join('')
  if (type === Fragment) return text
  if (typeof type === 'function') return type({ ...props, children: text })
  return '<' + type + '>' + text + '</' + type + '>'
}
`
  const module: Record<string, (props: unknown) => string> = await import(
    /* @vite-ignore */ `data:text/javascript,${encodeURIComponent(jsx + code)}`
  )
  return module.H0!(props)
}

describe('known Hydrate split bugs ported from SolidStart', () => {
  // Bug: split children that read the component's `arguments` are moved
  // into the chunk component unchanged, where `arguments` is the chunk's own
  // (its props are the captured locals, not the component's props). `this`
  // and `super` are rejected for the same reason; `arguments` is not.
  // Impact: the boundary hydrates with different values than the server
  // rendered, silently. Rejecting it at compile time is an acceptable fix.
  // Remove `.fails` once fixed.
  // validate.ts: "rejects `arguments` in an arrow inside a function"
  test.fails(
    "split children reading the component's arguments render its props",
    async () => {
      let compiled: Awaited<ReturnType<typeof compileHydrate>>
      try {
        compiled =
          await compileHydrate(`import { Hydrate } from '@tanstack/react-start'
export function Page() {
  return <Hydrate><p>{arguments[0].title}</p></Hydrate>
}`)
      } catch {
        return
      }
      expect(compiled.chunks).toHaveLength(1)
      // Evaluate the props the parent passes to the lazy chunk element the
      // way React calls `Page`: with its props as the first argument.
      const attributes = compiled.parent.match(/<_H0?\b([^>]*?)\/>/)![1]!
      const props = [...attributes.matchAll(/([\w$]+)=\{([^}]*)\}/g)]
        .map(([, name, value]) => `${JSON.stringify(name)}: ${value}`)
        .join(', ')
      const passed = new Function(
        `return function () { return { ${props} } }`,
      )()({ title: 'Hello' })
      expect(await renderChunk(compiled.chunks[0]!, passed)).toBe(
        '<p>Hello</p>',
      )
    },
  )

  // Bug: any `this` inside split children rejects the boundary with
  // "Hydrate cannot code-split JSX that captures this", including a `this`
  // that belongs to a function, class or object method written inside the
  // children and so moves with them. Impact: valid code fails to build.
  // Remove `.fails` once fixed.
  // compile.spec.ts: "allows `this` and `arguments` in a function expression"
  test.fails.each([
    {
      name: 'a function expression',
      children: `{(function (this: unknown) { return typeof this })()}`,
      rendered: '<p>undefined</p>',
    },
    {
      name: 'a class',
      children: `{new (class { label = 'inner'; read() { return this.label } })().read()}`,
      rendered: '<p>inner</p>',
    },
    {
      name: 'an object method',
      children: `{({ label: 'inner', read() { return this.label } }).read()}`,
      rendered: '<p>inner</p>',
    },
  ])(
    'split children may use the own `this` of $name',
    async ({ children, rendered }) => {
      const { parent, chunks } =
        await compileHydrate(`import { Hydrate } from '@tanstack/react-start'
export function Page() {
  return <Hydrate><p>${children}</p></Hydrate>
}`)
      expect(await getModuleErrors(parent)).toEqual([])
      expect(chunks).toHaveLength(1)
      expect(await renderChunk(chunks[0]!)).toBe(rendered)
    },
  )
})
