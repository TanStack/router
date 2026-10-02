import { is, walk } from 'yuku-ast'
import { unwrapExpression } from '@tanstack/router-utils'
import type {
  CallExpression,
  Node,
  Program,
  VariableDeclarator,
} from '@yuku-toolchain/types'
import type { StartCompilerTransformContext } from '../types'

export function sourcePosition(code: string, offset: number) {
  const before = code.slice(0, offset)
  const lines = before.split('\n')
  return { line: lines.length, column: lines[lines.length - 1]!.length }
}

export function codeFrameError(
  code: string,
  node: Pick<Node, 'start' | 'end'>,
  message: string,
) {
  const start = sourcePosition(code, node.start)
  const lines = code.split('\n')
  const frame = lines
    .slice(Math.max(0, start.line - 2), start.line + 1)
    .map((line, index) => {
      const number = Math.max(1, start.line - 1) + index
      return `${number} | ${line}${number === start.line ? `\n  | ${' '.repeat(start.column)}^ ${message}` : ''}`
    })
    .join('\n')
  return new Error(frame)
}

/** Keep semantic module IDs intact; this is only for physical-file matching. */
export function cleanId(id: string): string {
  if (id.startsWith('\0')) {
    id = id.slice(1)
  }
  const queryIndex = id.indexOf('?')
  return queryIndex === -1 ? id : id.substring(0, queryIndex)
}

/** Output-tree edits use native node identity; semantic queries use the source module. */
export function createAstEditor(ast: Program) {
  const parents = new WeakMap<Node, { parent: Node; key: string }>()
  function indexSubtree(root: Node) {
    walk(root, {
      enter(node, context) {
        if (context.parent && context.key) {
          parents.set(node, { parent: context.parent, key: context.key })
        }
      },
    })
  }
  indexSubtree(ast)
  return {
    parentOf(node: Node): Node | null {
      return parents.get(node)?.parent ?? null
    },
    replaceNode(node: Node, replacement: Node): void {
      const position = parents.get(node)
      if (!position) {
        throw new Error('Cannot replace a node outside the output tree')
      }
      const record = position.parent as unknown as Record<string, unknown>
      const field = record[position.key]
      if (Array.isArray(field)) {
        const index = field.indexOf(node)
        if (index < 0) {
          throw new Error('Cannot replace a detached output node')
        }
        field[index] = replacement
      } else {
        record[position.key] = replacement
      }
      parents.set(replacement, position)
      indexSubtree(replacement)
    },
  }
}

export function getVariableDeclarator(
  node: Node,
  parentOf: (node: Node) => Node | null,
): VariableDeclarator | null {
  let parent = parentOf(node)
  while (
    parent &&
    is.oneOf(parent, [
      'ParenthesizedExpression',
      'TSAsExpression',
      'TSSatisfiesExpression',
      'TSNonNullExpression',
      'TSTypeAssertion',
    ])
  ) {
    node = parent
    parent = parentOf(node)
  }
  return is.VariableDeclarator(parent) && parent.init === node ? parent : null
}

export function stripMethodCall(
  call: CallExpression,
  context: StartCompilerTransformContext,
): void {
  const callee = is.Expression(call.callee)
    ? unwrapExpression(call.callee)
    : call.callee
  if (is.MemberExpression(callee)) {
    context.replaceNode(call, callee.object)
  }
}
