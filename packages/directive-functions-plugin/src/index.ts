import type { Plugin } from 'vite'

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#escaping
function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // $& means the whole matched string
}

export const directiveFunctions = (
  options: {
    directives?: Array<string>
  } = {},
): Plugin => {
  const { directives = ['use client', 'use server'] } = options
  return {
    name: 'vite-plugin-directive-functions',
    enforce: 'pre',
    transform(code, id) {
      if (!/\.(t|j)sx?$/.test(id)) {
        return
      }

      for (const directive of directives) {
        const escapedDirective = escapeRegExp(directive)
        const regex = new RegExp(
          `(['"])${escapedDirective}\\1;?\\s*\\n(export\\s+(async\\s+)?function)`,
          'g',
        )
        code = code.replace(regex, `$2\n'${directive}';`)
      }

      return {
        code,
        map: null,
      }
    },
  }
}
