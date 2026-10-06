import { parseSync, transformWithOxc } from 'vite'
import { describe, expect, test } from 'vitest'
import { createHydrateCompilerPlugin } from '../src/hydrate-when-transform'
import { compileStartModule } from './compile-start-module'
import { getModuleErrors } from './validate-module'

/** Compiles a module with `<Hydrate>` and loads the split chunks it imports. */
async function compileHydrate(env: 'client' | 'server', code: string) {
  const plugin = createHydrateCompilerPlugin()
  const parent = await compileStartModule({
    env,
    code,
    compilerPlugins: [plugin],
  })
  if (parent === null) {
    throw new Error('expected the module to be transformed')
  }
  const chunks = [...parent.matchAll(/import\((["'])(.+?)\1\)/g)].map(
    ([, , id]) => {
      const chunk = plugin.loadVirtualModule?.({
        id: id!,
        root: '/test',
        env,
        envName: env === 'client' ? 'client' : 'ssr',
      })
      if (!chunk) {
        throw new Error(`expected virtual module ${id} to load`)
      }
      return chunk.code
    },
  )
  // Order chunks by boundary index, however the parent declares them.
  const index = (chunk: string) =>
    Number(chunk.match(/export function H(\d+)\(/)?.[1] ?? -1)
  chunks.sort((a, b) => index(a) - index(b))
  return { parent, chunks, plugin }
}

/**
 * Evaluates a self-contained chunk (no imports) like a bundler would and
 * renders one of its exports to a string: JSX becomes plain function calls
 * and intrinsic elements become tags.
 */
async function renderChunkExport(
  chunk: string,
  exportName: string,
  props: Record<string, unknown> = {},
) {
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
  return module[exportName]!(props)
}

/** Every split-chunk component name and the props the parent passes to it. */
function getChunkParams(chunk: string) {
  const params = chunk.match(/export function H\d+\(([^)]*)\)/)?.[1] ?? ''
  return [...params.matchAll(/[\w$]+/g)].map(([name]) => name).sort()
}

type JsxNode = {
  type: string
  name?: { type: string; name?: string }
  openingElement?: { name: { type: string; name?: string } }
  children?: Array<JsxNode & { value?: string }>
}

/** Finds the first JSX element named `name` in a module (Oxc ESTree). */
function findJsxElement(code: string, name: string): JsxNode | undefined {
  const { program } = parseSync('module.tsx', code, { sourceType: 'module' })
  let found: JsxNode | undefined
  const visit = (node: unknown): void => {
    if (found || !node || typeof node !== 'object') {
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
      found = current
      return
    }
    Object.values(node).forEach(visit)
  }
  visit(program)
  return found
}

function meaningfulChildren(element: JsxNode | undefined) {
  return (element?.children ?? []).filter(
    (child) => child.type !== 'JSXText' || child.value!.trim() !== '',
  )
}

describe('Hydrate split modules: edge cases', () => {
  test.each([
    {
      name: 'a map callback with a block body',
      children: `<ul>{letters.map((letter) => { const upper = letter.toUpperCase(); return <li>{upper}</li> })}</ul>`,
      rendered: '<ul><li>A</li><li>B</li></ul>',
    },
    {
      name: 'an immediately invoked function expression',
      children: `<p>{(function () { return letters.join('+') })()}</p>`,
      rendered: '<p>a+b</p>',
    },
    {
      name: 'a function-valued prop with a block body',
      children: `<Item format={(value) => { return '[' + value + ']' }} />`,
      rendered: '<li>[a]</li>',
    },
  ])(
    'client: split children may contain $name with return statements',
    async ({ children, rendered }) => {
      const { chunks } = await compileHydrate(
        'client',
        `import { Hydrate } from '@tanstack/react-start'
const letters = ['a', 'b']
function Item({ format }) { return <li>{format(letters[0])}</li> }
export function Page() {
  return <Hydrate>${children}</Hydrate>
}
`,
      )
      expect(chunks).toHaveLength(1)
      expect(await getModuleErrors(chunks[0]!)).toEqual([])
      expect(await renderChunkExport(chunks[0]!, 'H0')).toBe(rendered)
    },
  )

  test('client: a self-closing Hydrate returned from a component stays a valid module', async () => {
    const { parent } = await compileHydrate(
      'client',
      `import { Hydrate } from '@tanstack/react-start'
import { idle } from '@tanstack/react-start/hydration'
import { Chart } from './chart'
export function Page() {
  return <Hydrate when={idle()} children={<Chart />} />
}
`,
    )
    expect(await getModuleErrors(parent)).toEqual([])
  })

  test('client: a self-closing Hydrate does not render anything next to its boundary', async () => {
    const { parent } = await compileHydrate(
      'client',
      `import { Hydrate } from '@tanstack/react-start'
import { idle } from '@tanstack/react-start/hydration'
import { Chart } from './chart'
export function Page() {
  return <section><Hydrate when={idle()} children={<Chart />} /></section>
}
`,
    )
    expect(await getModuleErrors(parent)).toEqual([])
    // The server renders exactly one child here; any extra sibling would
    // break hydration of the section.
    const section = findJsxElement(parent, 'section')
    const children = meaningfulChildren(section)
    expect(children).toHaveLength(1)
    expect(children[0]!.openingElement?.name.name).toBe('Hydrate')
  })

  test('client: loop variables, destructured params and block-scoped locals are passed to the chunk under the same names', async () => {
    const { parent, chunks } = await compileHydrate(
      'client',
      `import { Hydrate } from '@tanstack/react-start'
function Row({ v }) { return <li>{v}</li> }
const items = ['x', 'y']
export function Page({ prefix = 'p', ...rest }) {
  const out = []
  for (const [key, value] of Object.entries(rest)) {
    const label = prefix + '-' + key
    out.push(<Hydrate key={key}><Row v={label + value} /></Hydrate>)
  }
  return <ul>{out}{items.map((item, i) => <Hydrate key={item}><Row v={item + i + prefix} /></Hydrate>)}</ul>
}
`,
    )
    expect(chunks).toHaveLength(2)
    expect(await getModuleErrors(parent)).toEqual([])
    for (const chunk of chunks) {
      expect(await getModuleErrors(chunk)).toEqual([])
    }
    const [forOf, map] = chunks.map((chunk) => getChunkParams(chunk))
    expect(forOf).toEqual(['label', 'value'])
    expect(map).toEqual(['i', 'item', 'prefix'])
    for (const name of [...forOf!, ...map!]) {
      expect(parent).toContain(`${name}={${name}}`)
    }
    // Module-level helpers move into the chunk with the children.
    expect(parent).not.toMatch(/function Row\b/)
    expect(
      await renderChunkExport(chunks[0]!, 'H0', { label: 'p-a', value: 1 }),
    ).toBe('<li>p-a1</li>')
    expect(
      await renderChunkExport(chunks[1]!, 'H1', {
        item: 'x',
        i: 0,
        prefix: 'p',
      }),
    ).toBe('<li>x0p</li>')
  })

  test('client: catch params, hoisted local functions and shadowing locals are captured', async () => {
    const { parent, chunks } = await compileHydrate(
      'client',
      `import { Hydrate } from '@tanstack/react-start'
const value = 'module'
export function Page() {
  const value = 'local'
  try {
    throw new Error('caught')
  } catch (error) {
    return <Hydrate><p>{value + ':' + error.message + ':' + later()}</p></Hydrate>
  }
  function later() { return 'hoisted' }
}
`,
    )
    expect(chunks).toHaveLength(1)
    expect(await getModuleErrors(parent)).toEqual([])
    expect(await getModuleErrors(chunks[0]!)).toEqual([])
    expect(getChunkParams(chunks[0]!)).toEqual(['error', 'later', 'value'])
    expect(
      await renderChunkExport(chunks[0]!, 'H0', {
        value: 'local',
        error: new Error('caught'),
        later: () => 'hoisted',
      }),
    ).toBe('<p>local:caught:hoisted</p>')
  })

  test.each(['split="false"', 'split={false}', 'split={(false)}'])(
    'client: %s keeps function-as-children in place',
    async (split) => {
      const code = `import { Hydrate } from '@tanstack/react-start'
export function Page() {
  return <Hydrate ${split}>{() => <p>child</p>}</Hydrate>
}
`
      const parent = await compileStartModule({
        env: 'client',
        code,
        compilerPlugins: [createHydrateCompilerPlugin()],
      })
      expect(parent).toBeNull()
    },
  )

  test.each(['split', 'split="true"', 'split={true}'])(
    'client: %s splits the children',
    async (split) => {
      const { chunks } = await compileHydrate(
        'client',
        `import { Hydrate } from '@tanstack/react-start'
export function Page() {
  return <Hydrate ${split}><p>child</p></Hydrate>
}
`,
      )
      expect(chunks).toHaveLength(1)
      expect(await renderChunkExport(chunks[0]!, 'H0')).toBe('<p>child</p>')
    },
  )

  test('server: fallback is stripped from a single-use spread object only', async () => {
    const single = await compileHydrate(
      'server',
      `import { Hydrate } from '@tanstack/react-start'
const opts = { fallback: <p>server-fallback</p>, when: true }
export function Page() { return <Hydrate {...opts}><p>child</p></Hydrate> }
`,
    )
    expect(single.parent).not.toContain('server-fallback')
    expect(single.parent).toContain('when: true')

    // A shared object or a computed one may be observed elsewhere: keep it.
    for (const code of [
      `import { Hydrate } from '@tanstack/react-start'
const opts = { fallback: <p>server-fallback</p> }
export function Page() { return <><Hydrate {...opts}><p>a</p></Hydrate><Hydrate {...opts}><p>b</p></Hydrate></> }
`,
      `import { Hydrate } from '@tanstack/react-start'
const makeOpts = () => ({ fallback: <p>server-fallback</p> })
const opts = makeOpts()
export function Page() { return <Hydrate {...opts}><p>child</p></Hydrate> }
`,
    ]) {
      const { parent } = await compileHydrate('server', code)
      expect(parent).toContain('server-fallback')
      expect(await getModuleErrors(parent)).toEqual([])
    }
  })

  test.each(['client', 'server'] as const)(
    '%s: a stale h attribute is replaced by the generated boundary id',
    async (env) => {
      const { parent } = await compileHydrate(
        env,
        `import { Hydrate } from '@tanstack/react-start'
export function Page() { return <Hydrate h="stale"><p>child</p></Hydrate> }
`,
      )
      expect(parent).not.toContain('stale')
      expect(parent.match(/\bh="/g)).toHaveLength(1)
    },
  )

  test('client: comment-only and empty boundaries load chunks that render nothing', async () => {
    const { parent, chunks } = await compileHydrate(
      'client',
      `import { Hydrate } from '@tanstack/react-start'
export function Page() {
  return <div><Hydrate></Hydrate><Hydrate>{/* nothing */}</Hydrate></div>
}
`,
    )
    expect(await getModuleErrors(parent)).toEqual([])
    expect(chunks).toHaveLength(2)
    for (const [index, chunk] of chunks.entries()) {
      expect(await getModuleErrors(chunk)).toEqual([])
      expect(await renderChunkExport(chunk, `H${index}`)).toBeNull()
    }
  })

  test('client: virtual module loads are cached until the source changes', async () => {
    const source = `import { Hydrate } from '@tanstack/react-start'
export function Page() { return <Hydrate><p>first</p></Hydrate> }
`
    const { parent, plugin } = await compileHydrate('client', source)
    const id = parent.match(/import\((["'])(.+?)\1\)/)![2]!
    const load = (moduleId: string) =>
      plugin.loadVirtualModule?.({
        id: moduleId,
        root: '/test',
        env: 'client',
        envName: 'client',
      })
    const first = load(id)
    expect(first?.code).toContain('first')
    expect(load(id)).toBe(first)

    // Unknown boundaries and ids without a split id are not Hydrate chunks.
    expect(load(id.replace(/=0_/, '=5_'))).toBeNull()
    expect(load('/test/src/module.tsx?other=1')).toBeNull()

    // Recompiling identical code keeps the cache; new code invalidates it.
    await compileStartModule({
      env: 'client',
      code: source,
      compilerPlugins: [plugin],
    })
    expect(load(id)).toBe(first)
    await compileStartModule({
      env: 'client',
      code: source.replace('first', 'second'),
      compilerPlugins: [plugin],
    })
    expect(load(id)?.code).toContain('second')
  })
})
