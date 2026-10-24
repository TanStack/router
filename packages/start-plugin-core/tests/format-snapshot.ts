import { format } from 'prettier'
import { parsers } from 'prettier/plugins/typescript'
import type { ParserOptions } from 'prettier'

/**
 * Formats compiler output before it is compared with a file snapshot, so that
 * snapshots record the emitted program instead of the layout choices of the
 * code generator (object wrapping, blank lines, parentheses around JSX, ...).
 *
 * Comments are kept: they are part of the output. Output that does not parse
 * is returned unchanged.
 */
export async function formatSnapshot(code: string, filepath: string) {
  try {
    return await format(await removeBlankLines(code, filepath), {
      filepath,
      parser: 'typescript',
      semi: false,
      singleQuote: true,
      trailingComma: 'all',
      // Do not keep an object expanded because the generator printed it
      // over several lines.
      objectWrap: 'collapse',
    })
  } catch {
    return code
  }
}

/**
 * Prettier keeps single blank lines from its input. Outside template literals,
 * line breaks are not significant, so blank lines can be dropped.
 */
async function removeBlankLines(code: string, filepath: string) {
  const parser = parsers.typescript
  const ast = await parser.parse(code, { filepath } as ParserOptions)
  const templateRanges: Array<[number, number]> = []
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }
    if (!node || typeof node !== 'object') {
      return
    }
    if ((node as { type?: unknown }).type === 'TemplateElement') {
      templateRanges.push([parser.locStart(node), parser.locEnd(node)])
    }
    for (const [key, value] of Object.entries(node)) {
      if (key !== 'loc' && key !== 'range') {
        visit(value)
      }
    }
  }
  visit(ast)

  const lines: Array<string> = []
  let lineStart = 0
  for (const line of code.split('\n')) {
    const isInTemplate = templateRanges.some(
      ([start, end]) => start < lineStart && lineStart < end,
    )
    if (line.trim() !== '' || isInTemplate) {
      lines.push(line)
    }
    lineStart += line.length + 1
  }
  return lines.join('\n')
}
