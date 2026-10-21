/**
 * `<Hydrate>` test helpers that are not part of the render kit
 * (`render.ts`).
 */
import { parseSync } from 'vite'
import { lazyCode, renderClient } from './render'
import type { HydrateHost } from './render'

type Node = { type: string; [key: string]: unknown }

function isNode(value: unknown): value is Node {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Node).type === 'string'
  )
}

/**
 * Names that refer to bindings in `code` (declared or read): identifiers and
 * JSX component names, but not property names, object keys, JSX attribute
 * names or the names other modules export.
 */
function bindingNames(code: string) {
  const parsed = parseSync('module.tsx', code, { sourceType: 'module' })
  if (parsed.errors.length > 0) {
    throw new Error(`Cannot parse module: ${parsed.errors[0]!.message}`)
  }
  const names = new Set<string>()
  const visit = (node: unknown, parent?: Node, key?: string) => {
    if (Array.isArray(node)) {
      for (const child of node) {
        visit(child, parent, key)
      }
      return
    }
    if (!isNode(node)) {
      return
    }
    const nonReference =
      (parent?.type === 'MemberExpression' &&
        key === 'property' &&
        !parent.computed) ||
      (parent?.type === 'Property' &&
        key === 'key' &&
        !parent.computed &&
        !parent.shorthand) ||
      ((parent?.type === 'MethodDefinition' ||
        parent?.type === 'PropertyDefinition') &&
        key === 'key' &&
        !parent.computed) ||
      (parent?.type === 'ImportSpecifier' && key === 'imported') ||
      (parent?.type === 'ExportSpecifier' && key === 'exported') ||
      (parent?.type === 'JSXAttribute' && key === 'name') ||
      (parent?.type === 'JSXMemberExpression' && key === 'property')
    if (
      !nonReference &&
      (node.type === 'Identifier' ||
        (node.type === 'JSXIdentifier' && /^[A-Z_$]/.test(node.name as string)))
    ) {
      names.add(node.name as string)
    }
    for (const child in node) {
      if (child !== 'type') {
        visit(node[child], node, child)
      }
    }
  }
  visit(parsed.program)
  return names
}

/**
 * The binding names the compiler introduces when it splits the `<Hydrate>`
 * children of `code`: names in what the dev server serves for the module
 * (client and SSR) and for the split code a page loads when it hydrates it
 * (whatever modules that is), that `code` does not have. A fixture
 * declaring them as user bindings or globals checks that generated names
 * never collide with the user's, whatever names the compiler picks.
 */
export async function generatedNames(hosts: HydrateHost, code: string) {
  const source = bindingNames(code)
  // What the dev server and the framework plugin add to every JSX module
  // they serve (HMR and refresh setup, interop bindings), whatever the
  // compiler does: the names of a module without a boundary, digits
  // ignored (their counters vary with the imports).
  const control = await hosts.start.case({
    'module.tsx': `import { useState } from 'react'\nexport const Control = () => <p>{String(useState)}</p>\n`,
  })
  const shape = (name: string) => name.replace(/\d+/g, '#')
  const pipeline = new Set<string>()
  for (const environment of ['client', 'ssr'] as const) {
    for (const name of bindingNames(
      await control.served('module.tsx', environment),
    )) {
      pipeline.add(shape(name))
    }
  }
  const client = await renderClient(hosts, code)
  const outputs = [
    await client.case.served('module.tsx', 'client'),
    await client.case.served('module.tsx', 'ssr'),
    ...Object.values(await lazyCode(hosts, client)),
  ]
  const names = new Set<string>()
  for (const output of outputs) {
    for (const name of bindingNames(output)) {
      if (!source.has(name) && !pipeline.has(shape(name))) {
        names.add(name)
      }
    }
  }
  return [...names].sort()
}
