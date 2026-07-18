import { compileToVolarMappings } from 'octane/compiler/volar'

/**
 * @typedef {object} AstNode
 * @property {AstNode | Array<AstNode>} [body]
 * @property {number} [start]
 * @property {number} [end]
 * @property {{ native_tsrx_body?: boolean }} [metadata]
 */

/**
 * Makes TSRX route modules parseable by the router generator without changing
 * source offsets. The generator applies edits to the original source, so the
 * authored Octane template bodies remain byte-for-byte intact.
 *
 * @param {string} source
 * @param {string} [filename]
 * @returns {string}
 */
export function maskOctaneRouteSource(source, filename = 'route.tsrx') {
  const { sourceAst } = compileToVolarMappings(source, filename)
  const output = source.split('')

  for (const body of findNativeTemplateBodies(
    /** @type {AstNode} */ (sourceAst),
  )) {
    const { start, end } = body
    output[start] = ' '
    output[start + 1] = '{'
    for (let index = start + 2; index < end - 1; index++) {
      if (source[index] !== '\n' && source[index] !== '\r') {
        output[index] = ' '
      }
    }
    output[end - 1] = '}'
  }

  return output.join('')
}

/**
 * @returns {{
 *   name: string
 *   transformRouteSource: (options: { source: string, filename: string }) => string
 *   formatRoute: (options: { source: string }) => string
 * }}
 */
export function octaneRouteGeneratorPlugin() {
  return {
    name: 'octane-route-source',
    transformRouteSource: ({ source, filename }) =>
      maskOctaneRouteSource(source, filename),
    // Router scaffolds are already formatted. Returning them unchanged avoids
    // passing TSRX's `@{}` syntax through a TypeScript-only formatter.
    formatRoute: ({ source }) => source,
  }
}

/**
 * @param {AstNode} root
 * @returns {Array<{ start: number, end: number }>}
 */
function findNativeTemplateBodies(root) {
  /** @type {Array<{ start: number, end: number }>} */
  const bodies = []
  const visited = new WeakSet()

  /** @param {unknown} value */
  const visit = (value) => {
    if (!value || typeof value !== 'object' || visited.has(value)) {
      return
    }
    visited.add(value)

    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item)
      }
      return
    }

    const node = /** @type {AstNode} */ (value)
    if (
      node.metadata?.native_tsrx_body === true &&
      node.body &&
      !Array.isArray(node.body) &&
      typeof node.body.start === 'number' &&
      typeof node.body.end === 'number'
    ) {
      bodies.push({ start: node.body.start, end: node.body.end })
      return
    }

    for (const [key, child] of Object.entries(node)) {
      if (key !== 'metadata' && key !== 'loc') {
        visit(child)
      }
    }
  }

  visit(root)
  return bodies
}
