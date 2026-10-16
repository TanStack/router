import { afterEach, describe, expect, test } from 'vitest'
import {
  expectRenderedThroughChunks,
  loadClientModule,
} from './regression-helpers'
import type { ModuleStub } from './regression-helpers'

// `<Hydrate>` moves its children into a lazily loaded chunk on the client.
// Whatever the children read from the enclosing scopes and the module must
// still be the value the original reads: rendering the parent once its chunks
// have loaded gives the original output, inside the boundary. How the values
// reach the chunk is left open. React keeps the `key` and `ref` props for
// itself, so no captured local here is named like them (pinned in
// known-bugs-hydrate.test.ts).

const head = `import { Hydrate } from '@tanstack/react-start'\n`

/**
 * Compiles `code` for the client, loads it with its chunks (every module
 * valid, `loadClientModule`) and renders `Page(props)`, which must render its
 * children through their chunks.
 */
async function renderPage(
  code: string,
  props?: Record<string, unknown>,
  stubs?: Record<string, ModuleStub>,
) {
  const { module, lazyChunks } = await loadClientModule(`${head}${code}`, {
    stubs,
  })
  const html = module.Page(props)
  expectRenderedThroughChunks(lazyChunks)
  return html
}

test.each<{
  name: string
  children: string
  expected: string
}>([
  {
    // Source: @vitejs/plugin-rsc hoist/function-hoist-block.js
    name: 'past a function declared in a nested block',
    children: `{(() => {
  const seen = value
  {
    function value() {}
  }
  return seen
})()}`,
    expected: '<p>outer</p>',
  },
  {
    // Source: @vitejs/plugin-rsc scope/param-default-var-hoisting.js
    name: 'from a parameter default next to a var of the same name',
    children: `{((seen = value) => {
  var value = 'inner'
  return seen + ':' + value
})()}`,
    expected: '<p>outer:inner</p>',
  },
  {
    // Source: @vitejs/plugin-rsc scope/label.js
    name: 'next to a label of the same name',
    children: `{(() => {
  value: for (const item of [1]) {
    if (item) {
      break value
    }
  }
  return value
})()}`,
    expected: '<p>outer</p>',
  },
  {
    // Source: Qwik optimizer should_not_auto_export_var_shadowed_in_labeled_block
    // (#8504 hydrate-captures.test.ts)
    name: 'only through references, not through a label of the same name',
    children: `{(() => {
  field: {
    break field
  }
  return 'after'
})()}`,
    expected: '<p>after</p>',
  },
  {
    // Source: @vitejs/plugin-rsc hoist/computed-destructuring-key-captures-outer-binding.js
    name: 'through a computed destructuring key',
    children: `{(({ [field]: picked }) => picked)({ value })}`,
    expected: '<p>outer</p>',
  },
  {
    // Source: @vitejs/plugin-rsc hoist/var-hoist-block.js, hoist/shadow-var-nested-block.js
    name: 'unless a var in a nested block shadows them',
    children: `{(() => {
  if (field) {
    var value = 'inner'
  }
  return value
})()}`,
    expected: '<p>inner</p>',
  },
  {
    // Source: SolidStart compile.spec.ts "allows `this` and `arguments` in a
    // function expression"
    name: 'except the arguments of a function expression',
    children: `{(function (..._args: Array<unknown>) {
  return arguments.length
})(1, 2)}`,
    expected: '<p>2</p>',
  },
])(
  'client: the children read the locals of the component $name',
  async ({ children, expected }) => {
    expect(
      await renderPage(`export function Page() {
  const value = 'outer'
  const field = 'value'
  return <Hydrate><p>${children}</p></Hydrate>
}`),
    ).toBe(`[${expected}]`)
  },
)

// Source: @vitejs/plugin-rsc hoist/function-hoist-block.js (module-level binding)
test('client: the children read a module binding past a block-level function', async () => {
  expect(
    await renderPage(`const value = 'module'
export function Page() {
  return <Hydrate><p>{(() => {
  const seen = value
  {
    function value() {}
  }
  return seen
})()}</p></Hydrate>
}`),
  ).toBe('[<p>module</p>]')
})

// Source: Qwik optimizer should_not_auto_export_var_shadowed_in_catch
test('client: the children read a catch parameter', async () => {
  expect(
    await renderPage(`export function Page() {
  try {
    throw new Error('caught')
  } catch (error) {
    return <Hydrate><p>{error.message}</p></Hydrate>
  }
}`),
  ).toBe('[<p>caught</p>]')
})

// Source: Qwik optimizer should_transform_handler_in_for_of_loop
test('client: the children read a destructured loop variable, a block-scoped local and a module helper', async () => {
  expect(
    await renderPage(
      `function Row({ v }) {
  return <li>{v}</li>
}
export function Page({ entries }) {
  const out = []
  for (const [key, value] of entries) {
    const label = key + '-'
    out.push(<Hydrate key={key}><Row v={label + value} /></Hydrate>)
  }
  return <ul>{out}</ul>
}`,
      { entries: [['a', 1]] },
    ),
  ).toBe('<ul>[<li>a-1</li>]</ul>')
})

describe('a binding named like an intrinsic tag', () => {
  afterEach(() => {
    delete (globalThis as { sideEffect?: unknown }).sideEffect
  })

  // Source: Qwik optimizer jsx_tag_names_are_not_segment_uses,
  // jsx_lowercase_tag_outside_segments, jsx_tag_named_like_inlined_const
  test.each([
    {
      scope: 'module',
      code: `const div = sideEffect('div')
console.log(div)
export function Page() {
  return <Hydrate><div>x</div></Hydrate>
}`,
    },
    {
      scope: 'component',
      code: `export function Page() {
  const div = sideEffect('div')
  console.log(div)
  return <Hydrate><div>x</div></Hydrate>
}`,
    },
  ])(
    'client: a $scope binding named like the tag the children render runs once',
    async ({ code }) => {
      let calls = 0
      ;(globalThis as { sideEffect?: unknown }).sideEffect = (
        value: unknown,
      ) => {
        calls++
        return value
      }
      expect(await renderPage(code)).toBe('[<div>x</div>]')
      expect(calls).toBe(1)
    },
  )
})

// Source: Qwik optimizer local_shadowing_destructured_prop,
// should_not_auto_export_var_shadowed_in_catch
test('client: names the children declare themselves shadow the locals of the component', async () => {
  expect(
    await renderPage(
      `export function Page({ value }) {
  const x = 'outer'
  console.log(x)
  return <Hydrate>
    <input value={value} onChange={(e) => { const value = e.target.value; return value }} />
    <p>{(() => { try { throw new Error('e') } catch (err) { const x = 'catch:' + err.message; return x } })()}</p>
  </Hydrate>
}`,
      { value: 'v' },
    ),
  ).toBe('[<input></input><p>catch:e</p>]')
})

// Source: Qwik optimizer example_functional_component_capture_props,
// example_spread_jsx, should_convert_rest_props
test('client: the children read destructured params with defaults and rests, and spread props', async () => {
  expect(
    await renderPage(
      `function Child(props) { return <b>{props.x + props.extra}</b> }
export function Page({ a: [b = 1], ...c }) {
  const extra = '!'
  return <Hydrate><p>{b}</p><Child {...c} {...{ extra }} /></Hydrate>
}`,
      { a: [], x: 'X' },
    ),
  ).toBe('[<p>1</p><b>X!</b>]')
})

// Split children move to another module, so only runtime values may reach
// them.
// Source: Qwik optimizer should_wrap_type_asserted_variables_in_template;
// SolidStart compile.spec.ts "does not read type annotations as captured values"
test('client: the children use local types', async () => {
  expect(
    await renderPage(
      `import type { Shape } from './types'
function format<T>(value: T) { return String(value) }
function List<T>(props: { items: Array<T> }) { return <ul>{props.items.length}</ul> }
export function Page({ v }: { v: unknown }) {
  type Local = string
  interface Box { value: Local }
  return <Hydrate><List<Box> items={[v] as Array<Shape>} /><p>{format<Local>(v as Local) + (v satisfies unknown as Box['value'] as Shape)}</p></Hydrate>
}`,
      { v: 'x' },
    ),
  ).toBe('[<ul>1</ul><p>xx</p>]')
})

describe('names the compiler generates', () => {
  afterEach(() => {
    delete (globalThis as { _H0?: unknown })._H0
  })

  // Source: Qwik optimizer example_qwik_conflict, import_collision_with_renaming;
  // hydrateWhen.test.ts "generated lazy names do not shadow existing global
  // references"
  test('client: a global named like a generated binding keeps its value', async () => {
    ;(globalThis as { _H0?: unknown })._H0 = 'g'
    const { module, lazyChunks } = await loadClientModule(
      `${head}export const before = _H0
export function Page() { return <Hydrate><div /></Hydrate> }`,
    )
    expect(module.before).toBe('g')
    expect(module.Page()).toBe('[<div></div>]')
    expectRenderedThroughChunks(lazyChunks)
  })

  // Source: Qwik optimizer example_qwik_conflict, import_collision_with_renaming
  test('client: user bindings and imports named like generated bindings keep their values', async () => {
    const { module, chunkIds } = await loadClientModule(
      `${head}import { lazyRouteComponent } from '@tanstack/react-router'
const _lazyRouteComponent = 'user'
export const Lazy = lazyRouteComponent(() => import('./other'))
export function Page() {
  const _H0 = 'local'
  const _H0_preload = 'preload'
  return <Hydrate prefetch><p>{_lazyRouteComponent + _H0 + _H0_preload}</p></Hydrate>
}`,
      { stubs: { './other': { default: () => '<i>other</i>' } } },
    )
    expect(chunkIds).toHaveLength(1)
    expect(module.Page()).toBe('[<p>userlocalpreload</p>]')
    // The user's own lazy component still loads its module.
    expect(module.Lazy()).toBe('<i>other</i>')
  })
})

// Source: Qwik optimizer example_capture_imports, example_qwik_conflict
test('client: a local shadowing an import or module binding wins inside the children only', async () => {
  expect(
    await renderPage(
      `import { label } from './labels'
import { Row } from './row'
const value = 'module'
function Show() { return <b>{value + ':' + label}</b> }
export function Page() {
  const label = 'local'
  const value = 'local-value'
  return <Hydrate><Row text={label} /><Show /><i>{value}</i></Hydrate>
}`,
      {},
      {
        './labels': { label: 'imported' },
        './row': { Row: ({ text }: { text: string }) => `<r>${text}</r>` },
      },
    ),
  ).toBe('[<r>local</r><b>module:imported</b><i>local-value</i>]')
})

// Source: Qwik optimizer nested_segment_param_does_not_collide_with_captured_props
test('client: a nested boundary reads the locals of the component around its enclosing boundary', async () => {
  const { module, lazyChunks } =
    await loadClientModule(`${head}export function Page({ isOpen, fee }) {
  const label = 'fee'
  return <Hydrate><section><Hydrate><p>{label + ':' + (isOpen ? fee : 0)}</p></Hydrate></section></Hydrate>
}`)
  expect(module.Page({ isOpen: true, fee: 5 })).toBe(
    '[<section>[<p>fee:5</p>]</section>]',
  )
  // The nested boundary rendered through its own chunk.
  expect(lazyChunks.map((chunk) => chunk.rendered)).toEqual([true, true])
})

// Source: hydrate-when-transform.test.ts "captures identifiers used by
// shorthand objects and computed members"
test('client: the children read locals through a shorthand property and a computed member', async () => {
  expect(
    await renderPage(`import { visible } from '@tanstack/react-start/hydration'
export function Page() {
  const key = 'name'
  const items = { name: 'Ada' }
  return (
    <Hydrate when={visible()}>
      <Widget data={{ key, value: items[key] }} />
    </Hydrate>
  )
}
function Widget(props: { data: { key: string; value: string } }) {
  return <p>{props.data.value}</p>
}`),
  ).toBe('[<p>Ada</p>]')
})

// Source: hydrateWhen.test.ts "retains captured local components and values
// across extraction"
test('client: the children render a local component and read a local value', async () => {
  expect(
    await renderPage(
      `export function Page({ name }) {
  const count = 1
  const Local = (props) => <b>{name}{props.count === count ? '' : '!'}</b>
  return <Hydrate><Local count={count}/><span>{name}</span></Hydrate>
}`,
      { name: 'n' },
    ),
  ).toBe('[<b>n</b><span>n</span>]')
})
