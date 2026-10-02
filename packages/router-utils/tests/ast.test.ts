import { describe, expect, test } from 'vitest'
import { b, walk } from 'yuku-ast'
import {
  analyzeModule,
  cloneGeneratedNode,
  cloneModuleAst,
  generatedReferenceOf,
  generateModule,
  linkGeneratedReference,
  parseExpression,
} from '../src/ast'
import type { Expression, Node } from '@yuku-toolchain/types'

describe('AST cloning', () => {
  test('preserves every native field, literal, comment, and source mapping', () => {
    const code = `// leading comment
      export const values = [/a[b/]+/giy, /\\p{Letter}/u, 123n, null, true, 1e309, -0,
        'é😀', \`raw\\n\${1}\`, , undefined] as const;
      // trailing comment
      export const View = <div data-value="é">{/* JSX comment */}text</div>;
    `
    const module = analyzeModule({ code, filename: 'literals.tsx' })
    const before = structuredClone(module.ast)
    const first = cloneModuleAst(module)
    const second = cloneModuleAst(module)
    expect(first.program).toStrictEqual(before)
    expect(second.program).toStrictEqual(before)
    const originals: Array<Node> = []
    walk(module.ast, {
      enter: (node) => {
        originals.push(node)
      },
    })
    let index = 0
    walk(first.program, {
      enter(node) {
        expect(node).not.toBe(originals[index])
        const original = originals[index++]!
        expect(first.originalNodes.get(node)).toBe(original)
        expect(first.copiedNodes.get(original)).toBe(node)
        if (node.type === 'Literal' && node.value instanceof RegExp) {
          expect(node.value).toBeInstanceOf(RegExp)
          node.value.lastIndex = 7
        }
      },
    })
    const options = { source: code, filename: 'literals.tsx' }
    expect(generateModule(first.program, options)).toStrictEqual(
      generateModule(module.ast, options),
    )
    let comments = 0
    walk(first.program, {
      enter(node) {
        for (const comment of node.comments ?? []) {
          comment.value = 'changed'
          comments++
        }
        if (node.type === 'ArrayExpression') {
          node.elements.length = 0
        }
      },
    })
    expect(comments).toBeGreaterThan(0)
    first.program.body.splice(0, 1)
    expect(module.ast).toStrictEqual(before)
    expect(second.program).toStrictEqual(before)
  })

  test('preserves shared comment records and sparse generated arrays', () => {
    const node = b.Identifier({ name: 'value' })
    const comment = {
      type: 'Block' as const,
      position: 'before' as const,
      sameLine: false,
      value: 'shared',
    }
    node.comments = [comment, comment]
    const expression = b.ArrayExpression({ elements: [node, null, null, node] })
    delete expression.elements[1]
    expression.elements.length = 6
    const copy = cloneGeneratedNode(expression)
    expect(copy).toStrictEqual(expression)
    expect(Object.hasOwn(copy.elements, 1)).toBe(false)
    expect(copy.elements).toHaveLength(6)
    expect(Object.hasOwn(copy.elements, 5)).toBe(false)
    expect(copy.elements[0]).toBe(copy.elements[3])
    const copiedComments = copy.elements[0]!.comments!
    expect(copiedComments[0]).toBe(copiedComments[1])
    expect(copiedComments[0]).not.toBe(comment)
    copiedComments[0]!.value = 'changed'
    expect(comment.value).toBe('shared')
  })

  test.each([-0, NaN, Infinity])(
    'preserves generated numeric values (%s)',
    (value) => {
      const node = b.Literal({ value, raw: String(value) })
      const copy = cloneGeneratedNode(node)
      expect(copy.type).toBe('Literal')
      expect(Object.is(copy.value, value)).toBe(true)
    },
  )

  test('copies generated symbol and unresolved-name provenance through repeated clones', () => {
    const module = analyzeModule({ code: 'const value = 1; value;' })
    const symbol = module.rootScope.find('value')!
    const reference = linkGeneratedReference(
      b.Identifier({ name: 'value' }),
      symbol,
    )
    const expression = b.BinaryExpression({
      operator: '+',
      left: reference,
      right: reference,
    })
    const first = cloneGeneratedNode(expression)
    const second = cloneGeneratedNode(first)
    expect(first.left).toBe(first.right)
    expect(first.left).not.toBe(reference)
    expect(second.left).not.toBe(first.left)
    expect(generatedReferenceOf(first.left)).toBe(symbol)
    expect(generatedReferenceOf(second.left)).toBe(symbol)
    const unresolved = parseExpression('external(value)')
    const copied = cloneGeneratedNode(cloneGeneratedNode(unresolved))
    const references: Array<string> = []
    walk(copied, {
      enter(node) {
        const target = generatedReferenceOf(node)
        if (typeof target === 'string') {
          references.push(target)
        }
      },
    })
    expect(references).toEqual(['external', 'value'])
    expect(copied).toStrictEqual(unresolved)
  })

  test('copies deeply nested compiler-owned fragments without recursive traversal', () => {
    let expression: Expression = linkGeneratedReference(
      b.Identifier({ name: 'value' }),
      'value',
    )
    for (let index = 0; index < 12000; index++) {
      expression = b.UnaryExpression({
        operator: '!',
        prefix: true,
        argument: expression,
      })
    }
    let copy: Expression = cloneGeneratedNode(expression)
    for (let index = 0; index < 12000; index++) {
      expect(copy === expression).toBe(false)
      if (
        copy.type !== 'UnaryExpression' ||
        expression.type !== 'UnaryExpression'
      ) {
        throw new Error('Expected the complete unary expression chain')
      }
      copy = copy.argument
      expression = expression.argument
    }
    expect(copy).toMatchObject({ type: 'Identifier', name: 'value' })
  })
})
