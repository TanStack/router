import { expect, test } from 'vitest'
import { analyzeModule, moduleDeclarationGraph } from '../src'

test.each(['Widget', '_Widget', '$Widget', 'ÉWidget', 'éWidget'])(
  'records JSX component %s as a runtime dependency',
  (name) => {
    const module = analyzeModule({
      code: `const ${name} = () => null;
export const render = () => <${name}></${name}>;`,
    })
    const graph = moduleDeclarationGraph(module)
    const component = module.rootScope.find(name)!
    expect(component.references).toHaveLength(2)
    expect(graph.dependencies.get(module.rootScope.find('render')!)).toEqual(
      new Set([component]),
    )
  },
)

test('distinguishes intrinsic JSX tags, member roots, and shadowed components', () => {
  const module = analyzeModule({
    code: `const _Widget = () => null;
const widgets = {};
export const render = () => {
  const _Widget = () => null;
  return <><_Widget /><widgets.Item /><div /><Widget-card /><svg:path /></>;
};`,
  })
  const graph = moduleDeclarationGraph(module)
  const outer = module.rootScope.find('_Widget')!
  const inner = module.bindings.find(
    (binding) => binding.name === '_Widget' && binding !== outer,
  )!
  expect(outer.references).toHaveLength(0)
  expect(inner.references).toHaveLength(1)
  expect(module.unresolvedReferences).toHaveLength(0)
  expect(graph.dependencies.get(module.rootScope.find('render')!)).toEqual(
    new Set([module.rootScope.find('widgets')!]),
  )
})
