import { afterEach, describe, expect, test } from 'vitest'
import {
  expectRendersLikeSource,
  renderClient,
  startPackage,
} from './regression-helpers'
import { generatedNames } from './hydrate-helpers'
import type { ClientOptions } from './regression-helpers'

// `<Hydrate>` moves its children into a lazily loaded chunk on the client.
// Whatever the children read from the enclosing scopes and the module must
// still be the value the original reads: the client output, once its chunks
// have loaded, renders what the uncompiled source and the server output
// render (real React and Start's real `Hydrate`, `render.ts`). How the
// values reach the chunk is left open. React keeps the `key` and `ref` props
// for itself, so no captured local here is named like them (pinned in
// known-bugs-hydrate.test.ts).

const head = `import { Hydrate } from '@tanstack/react-start'
import { load } from '@tanstack/react-start/hydration'
`

/**
 * Renders `<Page {...props} />` of `code` (after `head`) from the uncompiled
 * source, the server output and the client output (every module valid, the
 * children rendered through code loaded on demand): all three render the
 * same markup, which is returned.
 */
async function renderPage(
  code: string,
  props?: Record<string, unknown>,
  options: ClientOptions = {},
) {
  const { client } = await expectRendersLikeSource(`${head}${code}`, {
    ...options,
    props,
  })
  return client.html
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
  {
    // A let the component reassigns before it renders the boundary: the
    // children read its latest value, not its initializer.
    // Source: V4 red variant astra/14 (captures collected from constant
    // bindings only)
    name: 'through a let reassigned before the boundary',
    children: `{latest}`,
    expected: '<p>second</p>',
  },
])(
  'client: the children read the locals of the component $name',
  async ({ children, expected }) => {
    expect(
      await renderPage(`export function Page() {
  const value = 'outer'
  const field = 'value'
  let latest = 'first'
  if (field) {
    latest = 'second'
  }
  return <Hydrate when={load()}><p>${children}</p></Hydrate>
}`),
    ).toContain(expected)
  },
)

// Source: @vitejs/plugin-rsc hoist/function-hoist-block.js (module-level binding)
test('client: the children read a module binding past a block-level function', async () => {
  expect(
    await renderPage(`const value = 'module'
export function Page() {
  return <Hydrate when={load()}><p>{(() => {
  const seen = value
  {
    function value() {}
  }
  return seen
})()}</p></Hydrate>
}`),
  ).toContain('<p>module</p>')
})

// Source: Qwik optimizer should_not_auto_export_var_shadowed_in_catch
test('client: the children read a catch parameter', async () => {
  expect(
    await renderPage(`export function Page() {
  try {
    throw new Error('caught')
  } catch (error) {
    return <Hydrate when={load()}><p>{error.message}</p></Hydrate>
  }
}`),
  ).toContain('<p>caught</p>')
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
    out.push(<Hydrate when={load()} key={key}><Row v={label + value} /></Hydrate>)
  }
  return <ul>{out}</ul>
}`,
      { entries: [['a', 1]] },
    ),
  ).toContain('<li>a-1</li>')
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
  return <Hydrate when={load()}><div>x</div></Hydrate>
}`,
    },
    {
      scope: 'component',
      code: `export function Page() {
  const div = sideEffect('div')
  console.log(div)
  return <Hydrate when={load()}><div>x</div></Hydrate>
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
      const { client } = await expectRendersLikeSource(`${head}${code}`)
      expect(client.html).toContain('<div>x</div>')
      // The client output alone.
      calls = 0
      await renderClient(`${head}${code}`)
      expect(calls).toBe(1)
    },
  )
})

// Source: Qwik optimizer local_shadowing_destructured_prop,
// should_not_auto_export_var_shadowed_in_catch
test('client: names the children declare themselves shadow the locals of the component', async () => {
  const html = await renderPage(
    `export function Page({ value }) {
  const x = 'outer'
  console.log(x)
  return <Hydrate when={load()}>
    <input value={value} onChange={(e) => { const value = e.target.value; return value }} />
    <p>{(() => { try { throw new Error('e') } catch (err) { const x = 'catch:' + err.message; return x } })()}</p>
  </Hydrate>
}`,
    { value: 'v' },
  )
  expect(html).toContain('<input value="v"/><p>catch:e</p>')
})

// Source: Qwik optimizer example_functional_component_capture_props,
// example_spread_jsx, should_convert_rest_props
test('client: the children read destructured params with defaults and rests, and spread props', async () => {
  expect(
    await renderPage(
      `function Child(props) { return <b>{props.x + props.extra}</b> }
export function Page({ a: [b = 1], ...c }) {
  const extra = '!'
  return <Hydrate when={load()}><p>{b}</p><Child {...c} {...{ extra }} /></Hydrate>
}`,
      { a: [], x: 'X' },
    ),
  ).toContain('<p>1</p><b>X!</b>')
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
  return <Hydrate when={load()}><List<Box> items={[v] as Array<Shape>} /><p>{format<Local>(v as Local) + (v satisfies unknown as Box['value'] as Shape)}</p></Hydrate>
}`,
      { v: 'x' },
    ),
  ).toContain('<ul>1</ul><p>xx</p>')
})

describe('names the compiler generates', () => {
  /**
   * A page with a prefetched boundary and a nested one, whose children read
   * `reads` (an array expression); `setup` runs first in the component.
   */
  const page = (
    reads: string,
    setup = '',
  ) => `${head}import { idle } from '@tanstack/react-start/hydration'
export function Page() {
  ${setup}return <><Hydrate when={load()} prefetch={idle()}><p>{${reads}.join('|')}</p></Hydrate><Hydrate when={load()}><section><Hydrate when={load()}><b>nested</b></Hydrate></section></Hydrate></>
}`
  /**
   * Names a compiler could give what it generates (the helpers and props of
   * a lazy chunk component): always declared by the fixtures below, so they
   * check something even when the compiler introduces no name at all (SPEC
   * §5.1; FIX-PLAN HYD-22).
   */
  const fixedNames = [
    'lazy',
    'chunk',
    'Chunk',
    'HydrateChunk',
    'HydrateChildren',
    'captures',
    'props',
    'p',
    'h',
  ]
  /**
   * The names the compiler introduces for `page` (in any output), and
   * `fixedNames`, which the
   * fixtures below declare themselves: no test depends on which names the
   * compiler picks. The probe's children read a local, so the names the
   * compiler introduces to pass captured values to a chunk are among them.
   */
  const introducedNames = async () => [
    ...new Set([
      ...(await generatedNames(page('[captured]', `const captured = 'c'\n  `))),
      ...fixedNames,
    ]),
  ]

  let globals: Array<string> = []
  afterEach(() => {
    for (const name of globals) {
      delete (globalThis as Record<string, unknown>)[name]
    }
    globals = []
  })

  // Source: Qwik optimizer example_qwik_conflict, import_collision_with_renaming;
  // hydrateWhen.test.ts "generated lazy names do not shadow existing global
  // references"
  test('client: globals named like the generated bindings keep their values', async () => {
    globals = await introducedNames()
    for (const name of globals) {
      ;(globalThis as Record<string, unknown>)[name] = `global:${name}`
    }
    const { client } = await expectRendersLikeSource(
      `export const before = [${globals.join(', ')}]
${page(`['child']`)}`,
    )
    expect(client.module.before).toEqual(
      globals.map((name) => `global:${name}`),
    )
    expect(client.html).toContain('<p>child</p>')
    expect(client.html).toContain('<b>nested</b>')
  })

  // Module-level bindings with these names that the children read (or
  // shadow) are pinned in known-bugs-hydrate.test.ts.
  // Source: Qwik optimizer example_qwik_conflict, import_collision_with_renaming
  test.each([
    { scope: 'module', reads: `['child']` },
    { scope: 'local', reads: 'names' },
  ])(
    'client: $scope bindings named like the generated bindings keep their values',
    async ({ scope, reads }) => {
      const names = await introducedNames()
      const values = names.map((name) => `${scope}:${name}`).join('|')
      const declare = names
        .map((name) => `const ${name} = '${scope}:${name}'`)
        .join('\n  ')
      const read = reads === 'names' ? `[${names.join(', ')}]` : reads
      const { client } = await expectRendersLikeSource(
        `import { lazyRouteComponent } from '@tanstack/react-router'
${scope === 'module' ? declare : ''}
export const fromModule = ${scope === 'module' ? `[${names.join(', ')}].join('|')` : 'null'}
export const Lazy = lazyRouteComponent(() => import('./other'))
${page(read, scope === 'local' ? `${declare}\n  ` : '')}`,
        {
          files: { './other': `export default () => <i>other</i>` },
          // The user's own lazy component still loads its module.
          render: (m, h) => [
            h(m.Page, { key: 'page' }),
            h(m.Lazy, { key: 'lazy' }),
          ],
        },
      )
      expect(client.module.fromModule).toBe(scope === 'module' ? values : null)
      expect(client.html).toContain(
        `<p>${scope === 'local' ? values : 'child'}</p>`,
      )
      expect(client.html).toContain('<b>nested</b>')
      expect(client.html).toContain('<i>other</i>')
    },
  )
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
  return <Hydrate when={load()}><Row text={label} /><Show /><i>{value}</i></Hydrate>
}`,
      {},
      {
        files: {
          './labels': `export const label = 'imported'`,
          './row': `export const Row = ({ text }) => <r>{text}</r>`,
        },
      },
    ),
  ).toContain('<r>local</r><b>module:imported</b><i>local-value</i>')
})

// Source: Qwik optimizer nested_segment_param_does_not_collide_with_captured_props
test('client: a nested boundary reads the locals of the component around its enclosing boundary', async () => {
  const { client } = await expectRendersLikeSource(
    `${head}export function Page({ isOpen, fee }) {
  const label = 'fee'
  return <Hydrate when={load()}><section><Hydrate when={load()}><p>{label + ':' + (isOpen ? fee : 0)}</p></Hydrate></section></Hydrate>
}`,
    { props: { isOpen: true, fee: 5 } },
  )
  expect(client.html).toContain('<p>fee:5</p>')
})

// The local is not named `key`: React keeps a `key` prop for itself (pinned
// in known-bugs-hydrate.test.ts).
// Source: hydrate-when-transform.test.ts "captures identifiers used by
// shorthand objects and computed members"
test('client: the children read locals through a shorthand property and a computed member', async () => {
  expect(
    await renderPage(`import { visible } from '@tanstack/react-start/hydration'
export function Page() {
  const field = 'name'
  const items = { name: 'Ada' }
  return (
    <Hydrate when={visible()}>
      <Widget data={{ field, value: items[field] }} />
    </Hydrate>
  )
}
function Widget(props: { data: { field: string; value: string } }) {
  return <p>{props.data.field + ':' + props.data.value}</p>
}`),
  ).toContain('<p>name:Ada</p>')
})

// Like `style={{ color: color }}`.
test('client: the children read locals through a property value and a computed member alone', async () => {
  expect(
    await renderPage(`export function Page() {
  const label = 'Ada'
  const field = 'name'
  const items = { name: 'Lovelace' }
  return <Hydrate when={load()}><p>{({ text: label }).text + items[field]}</p></Hydrate>
}`),
  ).toContain('<p>AdaLovelace</p>')
})

// Optional members, method keys and other property names are pinned in
// known-bugs-hydrate.test.ts.
test('client: member names and object keys are no reads of a local declared later', async () => {
  expect(
    await renderPage(
      `export function Page({ obj }) {
  const el = <Hydrate when={load()}><p>{obj.later + ({ later: '!' }).later}</p></Hydrate>
  const later = 1
  console.log(later)
  return el
}`,
      { obj: { later: 'L' } },
    ),
  ).toContain('<p>L!</p>')
})

describe('globals', () => {
  afterEach(() => {
    delete (globalThis as { GlobalWidget?: unknown }).GlobalWidget
    delete (globalThis as { hydrateDefaults?: unknown }).hydrateDefaults
  })

  test('client: a boundary spreading a global splits children rendering a global component', async () => {
    const { load } = await startPackage('@tanstack/react-start/hydration')
    Object.assign(globalThis, {
      GlobalWidget: () => 'global-widget',
      hydrateDefaults: { when: load() },
    })
    expect(
      await renderPage(`export function Page() {
  return <Hydrate {...hydrateDefaults}><GlobalWidget /></Hydrate>
}`),
    ).toContain('global-widget')
  })
})

// Source: hydrateWhen.test.ts "retains captured local components and values
// across extraction"
test('client: the children render a local component and read a local value', async () => {
  expect(
    await renderPage(
      `export function Page({ name }) {
  const count = 1
  const Local = (props) => <b>{name + (props.count === count ? '' : '!')}</b>
  return <Hydrate when={load()}><Local count={count}/><span>{name}</span></Hydrate>
}`,
      { name: 'n' },
    ),
  ).toContain('<b>n</b><span>n</span>')
})
