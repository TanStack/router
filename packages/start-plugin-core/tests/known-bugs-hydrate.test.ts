/**
 * Known `<Hydrate>` split-transform bugs, pinned as expected failures.
 *
 * Every test asserts the CORRECT behaviour and is marked `.fails` because the
 * compiler does not implement it yet. When a fix lands, the test starts
 * passing, Vitest reports the `.fails` test as failed, and the `.fails`
 * modifier must be removed.
 */
import { parseSync, transformWithOxc } from 'vite'
import { describe, expect, test } from 'vitest'
import { createHydrateCompilerPlugin } from '../src/hydrate-when-transform'
import { compileStartModule } from './compile-start-module'
import { getModuleErrors } from './validate-module'

/** Compiles a module with `<Hydrate>` and loads every split chunk it imports. */
async function compileHydrate(env: 'client' | 'server', code: string) {
  const plugin = createHydrateCompilerPlugin()
  const parent = await compileStartModule({
    env,
    code,
    compilerPlugins: [plugin],
  })
  const loadChunk = (id: string) => {
    const chunk = plugin.loadVirtualModule?.({
      id,
      root: '/test',
      env,
      envName: env === 'client' ? 'client' : 'ssr',
    })
    if (!chunk) {
      throw new Error(`expected virtual module ${id} to load`)
    }
    return chunk.code
  }
  const chunkIds = [...(parent ?? '').matchAll(/import\((["'])(.+?)\1\)/g)].map(
    ([, , id]) => id!,
  )
  return { parent, chunkIds, loadChunk }
}

/**
 * Evaluates a self-contained chunk (no imports) and renders its only exported
 * component to a string: JSX becomes plain calls, intrinsic elements tags.
 */
async function renderChunk(chunk: string, props: Record<string, unknown> = {}) {
  const { code } = await transformWithOxc(chunk, 'chunk.tsx', {
    jsx: { runtime: 'classic', pragma: 'h', pragmaFrag: 'Fragment' },
  })
  const runtime = `const Fragment = Symbol('Fragment')
const h = (type, props, ...children) => {
  const text = children.flat(Infinity).filter((c) => c != null && c !== false).join('')
  if (type === Fragment) return text
  if (typeof type === 'function') return type({ ...props, children: text })
  return '<' + type + '>' + text + '</' + type + '>'
}
`
  const module: Record<string, (props: unknown) => string> = await import(
    /* @vite-ignore */ `data:text/javascript,${encodeURIComponent(runtime + code)}`
  )
  const components = Object.values(module)
  expect(components).toHaveLength(1)
  return components[0]!(props)
}

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

describe('known Hydrate split bugs', () => {
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
      const boundaryIds = (output: string) =>
        findJsxElements(output, 'Hydrate').flatMap((element) =>
          element.openingElement!.attributes.flatMap((attribute) =>
            attribute.name?.name === 'h' && attribute.value?.type === 'Literal'
              ? [(attribute.value as unknown as { value: string }).value]
              : [],
          ),
        )
      const serverIds = boundaryIds(server.parent!)
      expect(serverIds).toHaveLength(2)
      // The client renders the same two boundaries with the same ids.
      expect(boundaryIds(client.parent!)).toEqual(
        expect.arrayContaining(serverIds),
      )
      const rendered: Array<string> = []
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

  // Bug: captured locals are passed to the lazy chunk component under their
  // own names, so locals named `key` or `ref` become `key={key}` /
  // `ref={ref}`, which React consumes instead of passing them as props.
  // Impact: the split children render without those values.
  // Remove `.fails` once fixed.
  test.fails(
    'captured locals named key and ref reach the split children',
    async () => {
      const { parent, chunkIds, loadChunk } = await compileHydrate(
        'client',
        `import { Hydrate } from '@tanstack/react-start'
export function Page() {
  const key = 'k'
  const ref = 'r'
  return <Hydrate><p>{key}{ref}</p></Hydrate>
}`,
      )
      expect(chunkIds).toHaveLength(1)
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
      expect(await renderChunk(loadChunk(chunkIds[0]!), props)).toBe(
        '<p>kr</p>',
      )
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
      for (const id of compiled.chunkIds) {
        expect(await getModuleErrors(compiled.loadChunk(id))).toEqual([])
      }
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
      expect(compiled.chunkIds).toHaveLength(1)
      const chunk = compiled.loadChunk(compiled.chunkIds[0]!)
      expect(chunk).toMatch(
        /\bimport\b[^;]*\bRoute\b[^;]*\bfrom\b|\b(?:const|let|var|function|class)\s+Route\b|export function \w+\(\{[^}]*\bRoute\b/,
      )
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

  // Bug: module-level helpers used only by the split children move into the
  // chunk, where a helper named like the generated export (`H0`) collides
  // with it. Impact: the chunk is not a valid module and the build fails.
  // Remove `.fails` once fixed.
  test.fails(
    'a helper named like the generated chunk export does not collide',
    async () => {
      const { chunkIds, loadChunk } = await compileHydrate(
        'client',
        `import { Hydrate } from '@tanstack/react-start'
function H0() { return <b>helper</b> }
export function Page() {
  return <Hydrate><H0 /></Hydrate>
}`,
      )
      expect(chunkIds).toHaveLength(1)
      const chunk = loadChunk(chunkIds[0]!)
      expect(await getModuleErrors(chunk)).toEqual([])
      expect(await renderChunk(chunk)).toBe('<b>helper</b>')
    },
  )
})
