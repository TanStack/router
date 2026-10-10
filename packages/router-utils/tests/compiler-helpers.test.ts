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
    expect(
      [...graph.dependencies.get(module.rootScope.find('helper')!)!].map(
        (symbol) => symbol.name,
      ),
    ).toEqual(['dep'])
    expect(
      [...graph.dependencies.get(module.rootScope.find('Merged')!)!]
        .map((symbol) => symbol.name)
        .sort(),
    ).toEqual(['another', 'dep'])
    const { program, originalNodes } = cloneModuleAst(module)
    removeUnusedBindings(module, program, originalNodes)
    const output = generateModule(program).code
    expect(output).toContain('return dep + value')
    expect(output).toContain('const b = another')
    expect(output).toContain('const dep = 1')
    expect(output).toContain('const another = 2')
  })

  test('removes every overload and namespace block once they are unused', () => {
    const output = cleanup(
      `
      const dep = 1
      function helper(value: string): string
      function helper(value: any) { return dep + value }
      namespace Merged { export const a = 1 }
      namespace Merged { export const b = 2 }
      export const Route = createRoute({ loader: () => helper(Merged.a + Merged.b) })
    `,
      'loader',
    )
    expect(output).not.toContain('helper')
    expect(output).not.toContain('Merged')
    expect(output).not.toContain('dep')
  })

  test('tracks runtime enum and namespace declarations as owned bindings', () => {
    const code =
      'enum E { A }; namespace N { export const x = E.A } export const Route = createRoute({ loader: () => N.x });'
    const module = analyzeModule({ code })
    expect(
      [
        ...moduleDeclarationGraph(module).dependencies.get(
          module.rootScope.find('N')!,
        )!,
      ].map((symbol) => symbol.name),
    ).toEqual(['E'])
    const output = cleanup(code, 'loader')
    expect(output).not.toContain('enum E')
    expect(output).not.toContain('namespace N')
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

  test('drops the destructuring elements of erased bindings', () => {
    const output = cleanup(
      `const { a, b } = initialize(); export const Route = createRoute({ loader: () => a, component: () => b })`,
      'loader',
    )
    expect(output).toContain('const { b } = initialize()')
    expect(output.match(/initialize\(\)/g)).toHaveLength(1)
  })

  test.each([
    [
      'an object pattern default',
      'const { erased = readSecret(), kept } = config',
    ],
    [
      'an array pattern default',
      'const [erased = readSecret(), kept] = config',
    ],
    ['a computed key', 'const { [readSecret()]: erased, kept } = config'],
    [
      'a nested pattern default',
      'const { db: { erased = readSecret() } = {}, kept } = config',
    ],
    [
      'a function default',
      'const { erased = () => readSecret(), kept } = config',
    ],
  ])(
    'removes the dependencies of %s of an erased binding',
    (_, declaration) => {
      const output = cleanup(
        `
      import { readSecret } from './server'
      import { config } from './config'
      ${declaration}
      export const Route = createRoute({ loader: () => erased, component: () => kept })
    `,
        'loader',
      )
      expect(output).not.toContain('./server')
      expect(output).not.toContain('erased')
      expect(output).toMatch(/\bkept\b[^]*= config/)
    },
  )

  test('keeps the elements that an object rest binding excludes', () => {
    const output = cleanup(
      `
      import { readSecret } from './server'
      const { secret = readSecret(), ...rest } = config
      export const Route = createRoute({ loader: () => secret, component: () => rest })
    `,
      'loader',
    )
    expect(output).toContain('secret = readSecret(), ...rest')
    expect(output).toContain('./server')
  })

  test.each([true, false])(
    'executes whole destructured initializers only when a binding is live: %s',
    (used) => {
      const module = analyzeModule({
        code: `const { first, middle, last } = initialize(); globalThis.result = [first, middle, last][2]`,
      })
      const { program, originalNodes } = cloneModuleAst(module)
      if (!used) {
        program.body.pop()
      }
      removeUnusedBindings(module, program, originalNodes)
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

  test('preserves side effects that only reference themselves or each other', () => {
    const output = cleanup(
      `
      import { store } from './store'
      import { createPersister } from './persist'
      const stop = store.subscribe(() => stop())
      const persister = createPersister({ onRestore: () => restore() })
      function restore() { persister.restore() }
      export function useThing() {
        const observer = new MutationObserver(() => observer.disconnect())
        return 1
      }
      export const Route = createRoute({ loader: () => 1 })
    `,
      'loader',
    )
    expect(output).toContain('store.subscribe(')
    expect(output).toContain("import { store } from './store'")
    expect(output).toContain('createPersister(')
    expect(output).toContain('function restore()')
    expect(output).toContain('new MutationObserver(')
  })

  test('removes dependencies of an unused local once its enclosing declaration is erased', () => {
    const output = cleanup(
      `
      import { useMutation } from './mutation'
      function save() {}
      function Component() {
        const mutation = useMutation({ fn: save })
        return null
      }
      export const Route = createRoute({ component: Component, loader: () => 1 })
    `,
      'component',
    )
    expect(output).not.toContain('Component')
    expect(output).not.toContain('./mutation')
    expect(output).not.toContain('function save')
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
    removeUnusedBindings(module, program, originalNodes)
    expect(generateModule(program).code).toContain(
      "export const component = 'count'",
    )
  })

  test('does not retain a runtime import that only types still reference', () => {
    const output = cleanup(
      `
      import { server } from './server-only'
      type Server = typeof server
      export const Route = createRoute({ loader: () => server() })
    `,
      'loader',
    )
    expect(output).not.toContain('./server-only')
  })

  // Types are erased, so they neither use a declaration nor keep it alive
  test('keeps declarations only referenced from types for their side effects', () => {
    const output = cleanup(
      `
      import { registerAnalytics } from './analytics'
      const analytics = registerAnalytics()
      declare global {
        interface Window { analytics: typeof analytics }
      }
      export const Route = createRoute({ loader: () => 1 })
    `,
      'loader',
    )
    expect(output).toContain('const analytics = registerAnalytics()')
    expect(output).toContain("from './analytics'")
  })

  // The TypeScript transform erases them, except a classic JSX factory import
  test('keeps an import only types reference while code referencing it survives', () => {
    const output = cleanup(
      `
      import * as React from 'react'
      function Layout({ children }: { children: React.ReactNode }) {
        return <main>{children}</main>
      }
      export const Route = createRoute({ component: Layout, loader: () => 1 })
    `,
      'loader',
    )
    expect(output).toContain("import * as React from 'react'")
  })

  test('removes an import only types reference with the last code referencing it', () => {
    const output = cleanup(
      `
      import { Framework } from './projects'
      export const Route = createRoute({ loader: (): Framework => 'react', component: () => 1 })
    `,
      'loader',
    )
    expect(output).not.toContain('./projects')
  })

  // A classic JSX runtime compiles JSX to `React.createElement` calls
  test('keeps a React import only types reference wherever JSX survives', () => {
    const output = cleanup(
      `
      import * as React from 'react'
      export const Route = createRoute({ loader: (): React.ReactNode => null, component: () => <main /> })
    `,
      'loader',
    )
    expect(output).toContain("import * as React from 'react'")
  })

  test.each([
    ['function type parameters', '(theme: string) => void'],
    ['construct signature parameters', 'new (theme: string) => object'],
    ['method signature parameters', '{ set(theme: string): void }'],
    ['generic type parameters', '<Theme>() => void'],
    ['inferred type parameters', 'string extends infer Theme ? 1 : 0'],
  ])(
    'removes a dead declaration whose type arguments declare %s',
    (_, type) => {
      const output = cleanup(
        `import { createContext } from 'react'
const ThemeContext = createContext<${type}>(null!)
export const Route = createRoute({ component: () => <ThemeContext.Provider />, loader: () => 1 })`,
        'component',
      )
      expect(output).not.toContain('ThemeContext')
      expect(output).not.toContain('react')
    },
  )

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

  test('removes erased var declarators nested in statements and keeps the statements', () => {
    const output = cleanup(
      `
      import { a, b, c, d, e, f } from './server'
      if (cond) { var inIf = a(); keep() }
      try { var inTry = b() } catch {}
      switch (mode) { case 1: var inCase = c() }
      outer: { var inLabel = d(); break outer }
      for (var i = 0, inFor = e(); i < 1; i++) {}
      export function factory(flag) {
        if (flag) { var inFunction = f() }
        return createRoute({ loader: () => inFunction, component: () => 'ok' })
      }
      export const Route = createRoute({
        loader: () => [inIf, inTry, inCase, inLabel, inFor],
        component: () => 'ok',
      })
    `,
      'loader',
    )
    expect(output).not.toContain('./server')
    expect(output).not.toMatch(/\b[a-f]\(\)/)
    expect(output).toContain('keep()')
    expect(output).toContain('break outer')
    expect(output).toMatch(/for \(var i = 0; i < 1; i\+\+\)/)
    expect(analyzeModule({ code: output }).diagnostics).toEqual([])
  })

  test('keeps a statement wherever an erased var was its only content', () => {
    const output = cleanup(
      `
      import { a, b, c, d, e, f } from './server'
      if (cond) var inIf = a(); else var inElse = b()
      while (once()) var inWhile = c()
      outer: var inLabel = d()
      for (var inFor = e(); ; ) break
      for (;;) var inBody = f()
      export const Route = createRoute({
        loader: () => [inIf, inElse, inWhile, inLabel, inFor, inBody],
        component: () => 'ok',
      })
    `,
      'loader',
    )
    expect(output).not.toContain('./server')
    expect(output).not.toMatch(/\b[a-f]\(\)/)
    expect(output).toContain('cond')
    expect(output).toContain('once()')
    expect(analyzeModule({ code: output }).diagnostics).toEqual([])
  })

  test('removes every declarator of an erased var redeclared in a nested block', () => {
    const output = cleanup(
      `
      import { a, b } from './server'
      var value = a()
      if (cond) { var value = b() }
      export const Route = createRoute({ loader: () => value, component: () => 'ok' })
    `,
      'loader',
    )
    expect(output).not.toContain('./server')
    expect(output).not.toContain('value')
  })

  test('keeps nested vars that are still used or never were', () => {
    const output = cleanup(
      `
      import { a } from './server'
      if (cond) { var used = a(); var initiallyUnused = sideEffect() }
      for (var key in object) {}
      export const Route = createRoute({
        loader: () => [used, key],
        component: () => used,
      })
    `,
      'loader',
    )
    expect(output).toContain('var used = a()')
    expect(output).toContain('var initiallyUnused = sideEffect()')
    expect(output).toContain('for (var key in object)')
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
    removeUnusedBindings(module, program, originalNodes)
    expect(generateModule(program).code).toContain('const value = 1')
  })

  test('retains nested source references when cloning a generated fragment', async () => {
    const module = analyzeModule({ code: 'const value = 41;' })
    const { program, originalNodes } = cloneModuleAst(module)
    const generated = parseStatements(
      'export const result = (() => ({ read: () => value + 1 }))().read()',
    )[0]!
    program.body.push(cloneGeneratedNode(generated))
    removeUnusedBindings(module, program, originalNodes)
    const output = generateModule(program).code
    expect(output).toContain('const value = 41')
    const evaluated = await import(
      `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`
    )
    expect(evaluated.result).toBe(42)
  })
})
