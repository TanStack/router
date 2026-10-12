import { b } from 'yuku-ast'
import { generateModule, parseExpression } from '@tanstack/router-utils'
import { describe, expect, test } from 'vitest'
import {
  boundaryChild,
  boundaryComponent,
  constDeclaration,
  importDeclaration,
  jsxAttribute,
  lazyComponent,
  preloadAlias,
} from '../../src/hydrate-when-transform'
import { stringLiteral } from '../../src/start-compiler/utils'
import type { Node } from '@yuku-toolchain/types'

// The transform builds these nodes directly; print them to read the code they stand for.
const print = (node: Node) => generateModule(node).code

describe('Hydrate builders', () => {
  test('jsxAttribute', () => {
    expect(
      print(jsxAttribute('p', b.Identifier({ name: '_H0_preload' }))),
    ).toMatchInlineSnapshot(`"p={_H0_preload}"`)
  })

  test('constDeclaration', () => {
    expect(
      print(constDeclaration('value', b.Identifier({ name: 'init' }))),
    ).toMatchInlineSnapshot(`"const value = init;"`)
  })

  test('importDeclaration', () => {
    expect(
      print(
        importDeclaration(
          b.Identifier({ name: 'lazyRouteComponent' }),
          '_lazyRouteComponent',
          '@tanstack/react-router',
        ),
      ),
    ).toMatchInlineSnapshot(
      `"import { lazyRouteComponent as _lazyRouteComponent } from "@tanstack/react-router";"`,
    )
    expect(
      print(
        importDeclaration(
          stringLiteral('route export'),
          'Route',
          '/repo/src/routes/about.tsx',
        ),
      ),
    ).toMatchInlineSnapshot(
      `"import { "route export" as Route } from "/repo/src/routes/about.tsx";"`,
    )
  })

  test('lazyComponent', () => {
    expect(
      print(
        lazyComponent(
          '_H0',
          '_lazyRouteComponent',
          '/repo/src/routes/about.tsx?tss-hydrate=0_3cf0187f82',
          'H0',
        ),
      ),
    ).toMatchInlineSnapshot(
      `"const _H0 = _lazyRouteComponent(() => import("/repo/src/routes/about.tsx?tss-hydrate=0_3cf0187f82"), "H0");"`,
    )
  })

  test('preloadAlias', () => {
    expect(print(preloadAlias('_H0_preload', '_H0'))).toMatchInlineSnapshot(
      `"const _H0_preload = _H0.preload;"`,
    )
  })

  test('boundaryChild', () => {
    expect(print(boundaryChild('_H0', []))).toMatchInlineSnapshot(`"<_H0 />"`)
    expect(
      print(boundaryChild('_H0', ['count', 'title'])),
    ).toMatchInlineSnapshot(`"<_H0 count={count} title={title} />"`)
  })

  test('boundaryComponent', () => {
    const printAll = (nodes: Array<Node>) => nodes.map(print).join('\n')
    expect(
      printAll(boundaryComponent(0, 'H0', [], parseExpression('<Card />'))),
    ).toMatchInlineSnapshot(`
      "export function H0() {
        return <Card />;
      }"
    `)
    expect(
      printAll(
        boundaryComponent(
          1,
          'H1',
          ['count', 'title'],
          parseExpression('<Card title={title} count={count} />'),
        ),
      ),
    ).toMatchInlineSnapshot(`
      "export function H1({ count, title }) {
        return <Card title={title} count={count} />;
      }"
    `)
    expect(printAll(boundaryComponent(0, 'H02', [], parseExpression('<H0 />'))))
      .toMatchInlineSnapshot(`
      "function H02() {
        return <H0 />;
      }
      export { H02 as H0 };"
    `)
  })
})
