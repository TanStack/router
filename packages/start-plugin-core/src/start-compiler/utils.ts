import { CHILD_KEYS, is, isWrapper, walk } from 'yuku-ast'
import { sourcePosition, unwrapExpression } from '@tanstack/router-utils'
import type {
  CallExpression,
  Node,
  Program,
  VariableDeclarator,
} from '@yuku-toolchain/types'
import type { StartCompilerTransformContext } from '../types'

/** JavaScript line terminators, as counted by editors and parsers. */
const lineTerminator = /\r\n|[\n\r\u2028\u2029]/

export function codeFrameError(
  code: string,
  node: Pick<Node, 'start' | 'end'>,
  message: string,
) {
  const start = sourcePosition(code, node.start)
  const lines = code.split(lineTerminator)
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
  const parents = new WeakMap<Node, Node>()
  const replaced = new WeakSet<Node>()
  function indexSubtree(root: Node) {
    walk(root, {
      enter(node, context) {
        if (context.parent) {
          parents.set(node, context.parent)
        }
      },
    })
  }
  indexSubtree(ast)
  /** Replace `node` in the field of `parent` holding it, if any. */
  function replaceChild(parent: Node, node: Node, replacement: Node) {
    const record = parent as unknown as Record<string, unknown>
    for (const key of CHILD_KEYS[parent.type] ?? []) {
      const field = record[key]
      if (field === node) {
        record[key] = replacement
        return true
      }
      if (Array.isArray(field)) {
        const index = field.indexOf(node)
        if (index !== -1) {
          field[index] = replacement
          return true
        }
      }
    }
    return false
  }
  return {
    parentOf(node: Node): Node | null {
      return parents.get(node) ?? null
    },
    replaceNode(node: Node, replacement: Node): void {
      const parent = parents.get(node)
      if (!parent) {
        throw new Error('Cannot replace a node outside the output tree')
      }
      if (!replaceChild(parent, node, replacement)) {
        throw new Error('Cannot replace a detached output node')
      }
      parents.set(replacement, parent)
      indexSubtree(replacement)
      replaced.add(node)
    },
    /** Whether `replaceNode` removed `node` or one of its ancestors. */
    isReplaced(node: Node): boolean {
      for (
        let current: Node | undefined = node;
        current;
        current = parents.get(current)
      ) {
        if (replaced.has(current)) {
          return true
        }
      }
      return false
    },
  }
}

export function getVariableDeclarator(
  node: Node,
  parentOf: (node: Node) => Node | null,
): VariableDeclarator | null {
  let parent = parentOf(node)
  while (is.ChainExpression(parent) || isWrapper(parent)) {
    node = parent
    parent = parentOf(node)
  }
  return is.VariableDeclarator(parent) && parent.init === node ? parent : null
}

export function stripMethodCall(
  call: CallExpression,
  context: StartCompilerTransformContext,
): void {
  const callee = unwrapExpression(call.callee)
  if (is.MemberExpression(callee)) {
    context.replaceNode(call, callee.object)
  }
}
