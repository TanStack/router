import { is } from 'yuku-ast'
import { sourcePosition } from './utils'
import type * as t from '@yuku-toolchain/types'
import type { Binding, Module } from 'yuku-analyzer'

/** The Start factories whose implementation the compiler removes from a bundle. */
export const startFactoryNames = new Set([
  'createServerFn',
  'createMiddleware',
  'createIsomorphicFn',
  'createServerOnlyFn',
  'createClientOnlyFn',
])

/** Factories whose result is a builder, finished by a method */
const builderFactories = new Set([
  'createServerFn',
  'createMiddleware',
  'createIsomorphicFn',
])

/** Methods that finish a builder into the value the compiler rewrites */
const finishingMethods = new Set([
  'handler',
  'server',
  'client',
  'createMiddlewares',
])

const usage: Record<string, string> = {
  createServerFn:
    'export const fn = createServerFn().handler(...), or a builder: const builder = createServerFn(...)',
  createMiddleware: 'export const middleware = createMiddleware().server(...)',
  createIsomorphicFn:
    'export const fn = createIsomorphicFn().server(...).client(...)',
  createServerOnlyFn: 'export const fn = createServerOnlyFn(() => ...)',
  createClientOnlyFn: 'export const fn = createClientOnlyFn(() => ...)',
}

/** Wrappers that keep the value of their expression. */
function isTransparentWrapper(node: t.Node, child: t.Node) {
  return (
    is.oneOf(node, [
      'ParenthesizedExpression',
      'TSAsExpression',
      'TSSatisfiesExpression',
      'TSNonNullExpression',
      'TSTypeAssertion',
      'TSInstantiationExpression',
      'ChainExpression',
    ]) && (node as { expression: t.Node }).expression === child
  )
}

function isModuleLevelDeclarator(module: Module, node: t.Node) {
  const declaration = module.parentOf(node)
  const parent = declaration && module.parentOf(declaration)
  return (
    is.Program(parent) ||
    (is.ExportNamedDeclaration(parent) && is.Program(module.parentOf(parent)))
  )
}

/**
 * Finds the uses of a Start factory that the compiler does not rewrite, so
 * the implementation they receive stays in the client bundle.
 *
 * Every reference to a module-scope import of a factory (or a member of a
 * namespace import) must be part of a call chain the compiler rewrote
 * (`recognized`), initialize a module-level builder variable, be re-exported,
 * or initialize a module-level alias, whose references follow the same rule.
 * References inside code the client output drops (`stripped`, e.g. a server
 * fn handler) are not checked.
 *
 * @returns one message per unrecognized use
 */
export function findUnrecognizedFactoryUses(options: {
  module: Module
  code: string
  id: string
  /** Whether `name` imported from `specifier` is a known Start factory */
  isFactoryImport: (specifier: string, name: string) => boolean
  /** Source nodes of the call chains the compiler rewrites */
  recognized: Set<t.Node>
  /** Source nodes whose code the output drops */
  stripped: Set<t.Node>
}): Array<string> {
  const { module, code, id, recognized, stripped } = options
  const messages: Array<{ start: number; message: string }> = []
  const followed = new Set<Binding>()
  const pending: Array<{ binding: Binding; factory: string }> = []

  const isStripped = (node: t.Node) => {
    for (
      let current: t.Node | null = node;
      current;
      current = module.parentOf(current)
    ) {
      if (stripped.has(current)) {
        return true
      }
    }
    return false
  }

  const check = (node: t.Node, factory: string) => {
    if (recognized.has(node) || isStripped(node)) {
      return
    }
    // Climb the call chain the reference starts: createServerFn(...).middleware(...)
    let top = node
    let chained = false
    // The chain calls the method that finishes it, so it is not a builder
    let finished = false
    for (;;) {
      const parent = module.parentOf(top)
      if (!parent) {
        break
      }
      if (isTransparentWrapper(parent, top)) {
        top = parent
      } else if (is.CallExpression(parent) && parent.callee === top) {
        top = parent
        chained = true
      } else if (is.MemberExpression(parent) && parent.object === top) {
        top = parent
        chained = true
        finished ||=
          is.Identifier(parent.property) &&
          finishingMethods.has(parent.property.name)
      } else {
        break
      }
    }
    const parent = module.parentOf(top)
    if (
      is.VariableDeclarator(parent) &&
      parent.init === top &&
      is.Identifier(parent.id) &&
      isModuleLevelDeclarator(module, parent)
    ) {
      if (!chained) {
        // An alias: its own references must be recognized
        const alias = module.bindingOf(parent.id)
        if (alias && !followed.has(alias)) {
          followed.add(alias)
          pending.push({ binding: alias, factory })
        }
        return
      }
      if (!finished && builderFactories.has(factory)) {
        // A builder, finished where it is used
        return
      }
    }
    if (is.ExportSpecifier(parent) && top === node) {
      return
    }
    const position = sourcePosition(code, node.start)
    messages.push({
      start: node.start,
      message: `Unrecognized use of ${factory} at ${id}:${position.line}:${position.column + 1}: it is not compiled, so its implementation ships to the client. Assign it to a module-level variable: ${usage[factory]}, with ${factory} imported directly from the Start package.`,
    })
  }

  for (const entry of module.imports) {
    if (entry.typeOnly || !entry.local) {
      continue
    }
    if (
      entry.kind === 'named' &&
      entry.name &&
      startFactoryNames.has(entry.name) &&
      options.isFactoryImport(entry.specifier, entry.name)
    ) {
      followed.add(entry.local)
      pending.push({ binding: entry.local, factory: entry.name })
      continue
    }
    if (entry.kind !== 'namespace') {
      continue
    }
    for (const reference of entry.local.references) {
      if (reference.inTypePosition) {
        continue
      }
      const member = module.parentOf(reference.node)
      if (!is.MemberExpression(member) || member.object !== reference.node) {
        continue
      }
      const name = member.computed
        ? is.Literal(member.property) &&
          typeof member.property.value === 'string'
          ? member.property.value
          : undefined
        : is.Identifier(member.property)
          ? member.property.name
          : undefined
      if (
        name &&
        startFactoryNames.has(name) &&
        options.isFactoryImport(entry.specifier, name)
      ) {
        check(member, name)
      }
    }
  }
  while (pending.length) {
    const { binding, factory } = pending.pop()!
    for (const reference of binding.references) {
      if (!reference.inTypePosition) {
        check(reference.node, factory)
      }
    }
  }
  return messages
    .sort((a, b) => a.start - b.start)
    .map(({ message }) => message)
}
