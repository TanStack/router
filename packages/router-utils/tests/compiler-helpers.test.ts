import { runInNewContext } from 'node:vm'
import { describe, expect, test } from 'vitest'
import { is, walk } from 'yuku-ast'
import {
  analyzeModule,
  cloneGeneratedNode,
  cloneModuleAst,
  generateModule,
  parseStatements,
} from '../src/ast'
import {
  collectModuleReferences,
  extractModuleInfo,
  moduleDeclarationGraph,
  removeUnusedBindings,
} from '../src/compiler-helpers'

function cleanup(code: string, erase: string) {
  const module = analyzeModule({ code })
  const { program, originalNodes } = cloneModuleAst(module)
  walk(program, {
    Property(node, context) {
      if (is.Identifier(node.key, erase)) {
        context.remove()
      }
    },
  })
  removeUnusedBindings(module, program, originalNodes)
  return generateModule(program).code
}

describe('semantic dependency analysis', () => {
  test('resolves nested closures, defaults, imports, and JSX without false shadowed dependencies', () => {
    const module = analyzeModule({
      code: `
      import { Component, dep, fallback } from 'pkg'
      const value = (param = fallback) => {
        const dep = param
        try { throw dep } catch (Component) { console.log(Component) }
        return () => <Component value={dep} />
      }
    `,
    })
    const graph = moduleDeclarationGraph(module)
    const value = module.rootScope.find('value')!
    expect(
      [...graph.dependencies.get(value)!].map((symbol) => symbol.name).sort(),
    ).toEqual(['Component', 'fallback'])
    expect(
      [...collectModuleReferences(module, graph.declarations.get(value)!)]
        .map((symbol) => symbol.name)
        .sort(),
    ).toEqual(['Component', 'fallback'])
  })

  test('maps named default function and class declarations', () => {
    for (const code of [
      'export default function named() {}',
      'export default class named {}',
    ]) {
      const module = analyzeModule({ code })
      expect(
        moduleDeclarationGraph(module).declarations.get(
          module.rootScope.find('named')!,
        )?.type,
      ).toMatch(/Declaration$/)
    }
  })

  test('extracts module imports, exports, and re-export sources through native records', () => {
    const module = analyzeModule({
      code: `
      import value, { dep as local } from 'dependency'
      export const result = value(local)
      export { result as renamed }
      export { another } from './other'
      export * from './all'
    `,
    })
    expect(
      module.imports.map((record) => [
        record.local?.name,
        record.specifier,
        record.name,
      ]),
    ).toEqual([
      ['value', 'dependency', 'default'],
      ['local', 'dependency', 'dep'],
    ])
    expect(
      module.exports.map((record) => [record.name, record.specifier]),
    ).toEqual([
      ['result', null],
      ['renamed', null],
      ['another', './other'],
      [null, './all'],
    ])
  })

  test('keeps distinct re-export identities when imported names collide', () => {
    const module = analyzeModule({
      code: `
      const foo = localFactory()
      export { foo }
      export { foo as a } from './a'
      export { foo as b } from './b'
    `,
    })
    const info = extractModuleInfo(module)
    expect(info.bindings.get(info.exports.get('foo')!)?.type).toBe('var')
    expect(info.bindings.get(info.exports.get('a')!)).toEqual({
      type: 'import',
      source: './a',
      importedName: 'foo',
    })
    expect(info.bindings.get(info.exports.get('b')!)).toEqual({
      type: 'import',
      source: './b',
      importedName: 'foo',
    })
  })

  test('includes overloaded implementations and merged namespace dependencies', () => {
    const module = analyzeModule({
      code: `
      const dep = 1
      const another = 2
      function helper(value: string): string
      function helper(value: number): number
      function helper(value: any) { return dep + value }
      namespace Merged { export const a = dep }
      namespace Merged { export const b = another }
      export const result = helper(Merged.a + Merged.b)
    `,
    })
    const graph = moduleDeclarationGraph(module)
    const helper = module.rootScope.find('helper')!
    const merged = module.rootScope.find('Merged')!
    expect(graph.declarations.get(helper)?.type).toBe('FunctionDeclaration')
    expect(
      [...graph.dependencies.get(helper)!].map((symbol) => symbol.name),
    ).toEqual(['dep'])
    expect(
      [...graph.dependencies.get(merged)!].map((symbol) => symbol.name).sort(),
    ).toEqual(['another', 'dep'])
    expect(
      [...graph.declarationSymbols.values()].filter((owners) =>
        owners.has(helper),
      ),
    ).toHaveLength(3)
    expect(
      [...graph.declarationSymbols.values()].filter((owners) =>
        owners.has(merged),
      ),
    ).toHaveLength(2)
    const { program, originalNodes } = cloneModuleAst(module)
    removeUnusedBindings(module, program, originalNodes, {
      preserveInitiallyUnused: false,
    })
    const output = generateModule(program).code
    expect(output).toContain('return dep + value')
    expect(output).toContain('const b = another')
    expect(output).toContain('const dep = 1')
    expect(output).toContain('const another = 2')
  })

  test('tracks runtime enum and namespace declarations as owned bindings', () => {
    const module = analyzeModule({
      code: 'enum E { A }; namespace N { export const x = E.A } export const value = N.x;',
    })
    const graph = moduleDeclarationGraph(module)
    expect(graph.declarations.get(module.rootScope.find('E')!)?.type).toBe(
      'TSEnumDeclaration',
    )
    expect(graph.declarations.get(module.rootScope.find('N')!)?.type).toBe(
      'TSModuleDeclaration',
    )
    expect(
      [...graph.dependencies.get(module.rootScope.find('N')!)!].map(
        (symbol) => symbol.name,
      ),
    ).toEqual(['E'])
  })

  test('groups destructured symbols in one initialization unit', () => {
    const module = analyzeModule({
      code: 'const { a, nested: { b } } = initialize()',
    })
    const graph = moduleDeclarationGraph(module)
    expect(graph.declarations.get(module.rootScope.find('a')!)).toBe(
      graph.declarations.get(module.rootScope.find('b')!),
    )
  })
})

describe('output liveness', () => {
  test('removes transitively erased server dependencies while preserving unrelated side effects', () => {
    const output = cleanup(
      `
      import { server } from './server'
      import './side-effect'
      const load = () => server()
      const unused = initialize()
      export const Route = createRoute({ loader: load, component: () => 'ok' })
    `,
      'loader',
    )
    expect(output).not.toContain('./server')
    expect(output).not.toContain('const load')
    expect(output).toContain("import './side-effect'")
    expect(output).toContain('initialize()')
  })

  test('retains destructuring as a whole when one binding is needed', () => {
    const output = cleanup(
      `const { a, b } = initialize(); export const Route = createRoute({ loader: () => a, component: () => b })`,
      'loader',
    )
    expect(output).toContain('a, b')
    expect(output.match(/initialize\(\)/g)).toHaveLength(1)
  })

  test.each([true, false])(
    'executes whole destructured initializers only when a sibling is live: %s',
    (used) => {
      const module = analyzeModule({
        code: `const { first, middle, last } = initialize(); ${used ? 'globalThis.result = last' : ''}`,
      })
      const { program, originalNodes } = cloneModuleAst(module)
      removeUnusedBindings(module, program, originalNodes, {
        preserveInitiallyUnused: false,
      })
      const events: Array<string> = []
      const context = {
        result: undefined,
        initialize() {
          events.push('initialize')
          return {
            get first() {
              events.push('first')
              return 0
            },
            get middle() {
              events.push('middle')
              return 1
            },
            get last() {
              events.push('last')
              return 2
            },
          }
        },
      }
      runInNewContext(generateModule(program).code, context)
      expect(context.result).toBe(used ? 2 : undefined)
      expect(events).toEqual(
        used ? ['initialize', 'first', 'middle', 'last'] : [],
      )
    },
  )

  test('removes unreachable cycles after their last consumer is erased', () => {
    const output = cleanup(
      'const a = () => b(); const b = () => a(); export const Route = createRoute({ loader: a })',
      'loader',
    )
    expect(output).not.toContain('const a')
    expect(output).not.toContain('const b')
  })

  test('does not change original AST or symbol identities when generating multiple outputs', () => {
    const module = analyzeModule({
      code: 'const value = 1; export const Route = value;',
    })
    const original = generateModule(module.ast).code
    const first = cloneModuleAst(module)
    first.program.body.splice(0, 1)
    const second = cloneModuleAst(module)
    expect(generateModule(second.program).code).toBe(original)
    expect(module.rootScope.find('value')!.references).toHaveLength(1)
  })

  test('retains exported namespace members through the live namespace owner', () => {
    const module = analyzeModule({
      code: `namespace Labels { export const component = 'count' } export { Labels }`,
    })
    const { program, originalNodes } = cloneModuleAst(module)
    removeUnusedBindings(module, program, originalNodes, {
      preserveInitiallyUnused: false,
    })
    expect(generateModule(program).code).toContain(
      "export const component = 'count'",
    )
  })

  test('does not retain a runtime import used only in erased type positions', () => {
    const module = analyzeModule({
      code: `import { Framework } from './server-only'; export const value = (): Framework => null as Framework`,
    })
    const { program, originalNodes } = cloneModuleAst(module)
    removeUnusedBindings(module, program, originalNodes)
    expect(generateModule(program).code).not.toContain('./server-only')
  })

  test('removes a dead namespace including its exported members', () => {
    const output = cleanup(
      `namespace Labels { export const component = initialize() } export const Route = createRoute({ loader: () => Labels.component })`,
      'loader',
    )
    expect(output).not.toContain('namespace Labels')
    expect(output).not.toContain('initialize()')
  })

  test('removes nested erased captures without keeping their enclosing dead closure', () => {
    const output = cleanup(
      `
      import { server } from './server'
      function factory() {
        const initiallyUnused = sideEffect()
        return server()
      }
      export const Route = createRoute({ loader: factory })
    `,
      'loader',
    )
    expect(output).not.toContain('./server')
    expect(output).not.toContain('factory')
    expect(output).not.toContain('initiallyUnused')
  })

  test('removes dependencies scoped inside surviving functions', () => {
    const output = cleanup(
      `
      import { server } from './server'
      export function factory() {
        const load = () => server()
        const initiallyUnused = sideEffect()
        return createRoute({ loader: load, component: () => 'ok' })
      }
    `,
      'loader',
    )
    expect(output).not.toContain('./server')
    expect(output).not.toContain('const load')
    expect(output).toContain('initiallyUnused')
  })

  test('generated parameter shadowing cannot retain an erased server import', () => {
    const module = analyzeModule({
      code: `import { server } from './server'; export const result = server()`,
    })
    const { program, originalNodes } = cloneModuleAst(module)
    program.body.splice(
      1,
      1,
      ...parseStatements('export const result = (server) => server()'),
    )
    removeUnusedBindings(module, program, originalNodes)
    expect(generateModule(program).code).not.toContain('./server')
  })

  test('retains source dependencies introduced in generated nodes', () => {
    const module = analyzeModule({ code: 'const value = 1;' })
    const { program, originalNodes } = cloneModuleAst(module)
    program.body.push(...parseStatements('export const result = value'))
    removeUnusedBindings(module, program, originalNodes, {
      preserveInitiallyUnused: false,
    })
    expect(generateModule(program).code).toContain('const value = 1')
  })

  test('retains nested source references when cloning a generated fragment', async () => {
    const module = analyzeModule({ code: 'const value = 41;' })
    const { program, originalNodes } = cloneModuleAst(module)
    const generated = parseStatements(
      'export const result = (() => ({ read: () => value + 1 }))().read()',
    )[0]!
    program.body.push(cloneGeneratedNode(generated))
    removeUnusedBindings(module, program, originalNodes, {
      preserveInitiallyUnused: false,
    })
    const output = generateModule(program).code
    expect(output).toContain('const value = 41')
    const evaluated = await import(
      `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`
    )
    expect(evaluated.result).toBe(42)
  })
})
