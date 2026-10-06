import { transformWithOxc } from 'vite'
import { describe, expect, test } from 'vitest'
import { createHydrateCompilerPlugin } from '../src/hydrate-when-transform'
import { compileStartModule } from './compile-start-module'

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
  return { parent, chunks }
}

/**
 * Compiles a chunk's JSX like a bundler would and returns the text its
 * components render, so JSX text and string literals are compared by meaning.
 */
async function renderChunkText(chunk: string) {
  const { code } = await transformWithOxc(chunk, 'chunk.tsx', {
    jsx: { runtime: 'classic', pragma: 'h', pragmaFrag: 'Fragment' },
  })
  const runtime = `const Fragment = null
const h = (type, props, ...children) => children.flat().join('')
`
  const module: Record<string, unknown> = await import(
    /* @vite-ignore */ `data:text/javascript,${encodeURIComponent(runtime + code)}`
  )
  return Object.values(module)
    .map((value) => (typeof value === 'function' ? value() : ''))
    .join('')
}

const widgetPage = `
import { Hydrate } from '@tanstack/react-start'
import { visible } from '@tanstack/react-start/hydration'
import { Chart, FallbackPane } from './widgets'
import { formatValue } from './format'

const chartTitle = formatValue('Revenue')

export function Page() {
  return (
    <section>
      <Hydrate when={visible()} fallback={<FallbackPane label="chart" />}>
        <Chart title={chartTitle} />
      </Hydrate>
    </section>
  )
}
`

describe('Hydrate split modules', () => {
  test('client: bindings used only by the split children leave the parent module', async () => {
    const { parent, chunks } = await compileHydrate('client', widgetPage)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toContain('chartTitle')
    expect(parent).not.toContain('./format')
    expect(parent).not.toContain('chartTitle')
    expect(parent).not.toMatch(/\bChart\b/)
  })

  test('server: bindings used only by the stripped fallback are removed', async () => {
    const { parent } = await compileHydrate('server', widgetPage)
    expect(parent).not.toContain('FallbackPane')
  })

  test.each([
    { name: 'named entities', text: 'Fish &amp; Chips &copy;' },
    { name: 'decimal entities', text: 'Fish &#38; Chips &#169;' },
    { name: 'hexadecimal entities', text: 'Fish &#x26; Chips &#xA9;' },
    {
      name: 'multi-line text',
      text: '\n      Fish &amp;\n      Chips &copy;\n    ',
    },
  ])(
    'client: a text-only split child renders decoded $name',
    async ({ text }) => {
      const { chunks } = await compileHydrate(
        'client',
        `import { Hydrate } from '@tanstack/react-start'
export function Page() {
  return <Hydrate>${text}</Hydrate>
}
`,
      )
      expect(chunks).toHaveLength(1)
      // Only whitespace collapsing is left out: the entities must be decoded
      // like the server-rendered JSX text.
      const rendered = await renderChunkText(chunks[0]!)
      expect(rendered.replace(/\s+/g, ' ').trim()).toBe('Fish & Chips ©')
    },
  )

  test("client: 'use client' stays first in the parent module and the split chunk", async () => {
    const { parent, chunks } = await compileHydrate(
      'client',
      `'use client'
import { Hydrate } from '@tanstack/react-start'
import { Chart } from './chart'
export function Page() {
  return <Hydrate><Chart /></Hydrate>
}
`,
    )
    expect(chunks).toHaveLength(1)
    expect(parent.trimStart()).toMatch(/^['"]use client['"]/)
    expect(chunks[0]!.trimStart()).toMatch(/^['"]use client['"]/)
  })
})
