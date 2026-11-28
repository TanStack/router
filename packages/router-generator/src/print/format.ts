import type { CodeStyle } from './style'

/**
 * Formats the route tree with Prettier, only when
 * `enableRouteTreeFormatting` is `true`: Prettier is loaded on first use,
 * never at startup otherwise (the direct printer already prints the
 * configured style).
 */
export async function formatWithPrettier(
  source: string,
  style: CodeStyle,
): Promise<string> {
  const prettier = await import('prettier')
  return prettier.format(source, {
    semi: style.semicolons,
    singleQuote: style.quote === "'",
    parser: 'typescript',
  })
}
