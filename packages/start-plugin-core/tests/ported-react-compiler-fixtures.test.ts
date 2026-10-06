/**
 * Known Hydrate bugs found with inputs adapted from the React Compiler fixture
 * corpus (facebook/react,
 * compiler/packages/babel-plugin-react-compiler/src/__tests__/fixtures/compiler, MIT),
 * pinned as expected failures.
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

/** Compiles a module with one `<Hydrate>` boundary and loads its client chunk. */
async function compileHydrateChunk(code: string) {
  const plugin = createHydrateCompilerPlugin()
  const parent = await compileStartModule({
    env: 'client',
    code,
    compilerPlugins: [plugin],
  })
  const ids = [...(parent ?? '').matchAll(/import\((["'])(.+?)\1\)/g)]
  expect(ids).toHaveLength(1)
  const chunk = plugin.loadVirtualModule?.({
    id: ids[0]![2]!,
    root: '/test',
    env: 'client',
    envName: 'client',
  })
  if (!chunk) {
    throw new Error('expected the Hydrate chunk to load')
  }
  return chunk.code
}

/**
 * Evaluates a chunk like a bundler would, with its import sources replaced by
 * the given modules, and renders its `H0` export: JSX becomes plain function
 * calls and intrinsic elements become tags.
 */
async function renderChunk(chunk: string, imports: Record<string, string>) {
  const { code } = await transformWithOxc(chunk, 'chunk.tsx', {
    jsx: { runtime: 'classic', pragma: 'h', pragmaFrag: 'Fragment' },
  })
  const linked = code.replace(
    /(from\s*)(["'])([^"']+)\2/g,
    (match, from: string, _quote: string, source: string) =>
      source in imports
        ? `${from}${JSON.stringify(`data:text/javascript,${encodeURIComponent(imports[source]!)}`)}`
        : match,
  )
  const runtime = `const Fragment = Symbol('Fragment')
const h = (type, props, ...children) => {
  const text = children.flat(Infinity).filter((c) => c != null && c !== false).join('')
  if (type === Fragment) return text
  if (typeof type === 'function') return type({ ...props, children: text })
  return '<' + type + '>' + text + '</' + type + '>'
}
`
  const module: Record<string, (props: unknown) => string> = await import(
    /* @vite-ignore */ `data:text/javascript,${encodeURIComponent(runtime + linked)}`
  )
  return module.H0!({ props: {} })
}

describe('known Hydrate bugs (React Compiler fixtures)', () => {
  // Bug: a TypeScript import alias (`import Card = ui.Card`, adapted from
  // ts-import-equals-declaration.ts) used only by the split children is not
  // declared in the client chunk. Main keeps `import * as ui` in the parent
  // and drops the alias; the Yuku PR keeps the alias in the parent but drops
  // the `ui` import it reads. Impact: the chunk throws "Card is not defined"
  // when the boundary hydrates. Remove `.fails` once fixed.
  test.fails(
    'client: a TypeScript import alias used by the split children is declared in the chunk',
    async () => {
      const chunk =
        await compileHydrateChunk(`import { Hydrate } from '@tanstack/react-start'
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
`)
      expect(
        await renderChunk(chunk, {
          './ui': `export const Card = (props) => '<b>' + props.title + '</b>'`,
        }),
      ).toBe('<b>hi</b>')
    },
  )
})
