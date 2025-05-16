import * as fsp from 'node:fs/promises'
import * as prettier from 'prettier'

export function multiSortBy<T>(
  arr: Array<T>,
  accessors: Array<(item: T) => any> = [(d) => d],
): Array<T> {
  return arr
    .map((d, i) => [d, i] as const)
    .sort(([a, ai], [b, bi]) => {
      for (const accessor of accessors) {
        const ao = accessor(a)
        const bo = accessor(b)

        if (typeof ao === 'undefined') {
          if (typeof bo === 'undefined') {
            continue
          }
          return 1
        }

        if (ao === bo) {
          continue
        }

        return ao > bo ? 1 : -1
      }

      return ai - bi
    })
    .map(([d]) => d)
}

export function cleanPath(path: string) {
  // remove double slashes
  return path.replace(/\/{2,}/g, '/')
}

export function trimPathLeft(path: string) {
  return path === '/' ? path : path.replace(/^\/{1,}/, '')
}

export function logging(config: { disabled: boolean }) {
  function stripEmojis(str: string) {
    return str.replace(
      /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu,
      '',
    )
  }

  function formatLogArgs(args: Array<any>): Array<any> {
    if (process.env.CI) {
      return args.map((arg) =>
        typeof arg === 'string' ? stripEmojis(arg) : arg,
      )
    }
    return args
  }

  return {
    log: (...args: Array<any>) => {
      if (!config.disabled) console.log(...formatLogArgs(args))
    },
    debug: (...args: Array<any>) => {
      if (!config.disabled) console.debug(...formatLogArgs(args))
    },
    info: (...args: Array<any>) => {
      if (!config.disabled) console.info(...formatLogArgs(args))
    },
    warn: (...args: Array<any>) => {
      if (!config.disabled) console.warn(...formatLogArgs(args))
    },
    error: (...args: Array<any>) => {
      if (!config.disabled) console.error(...formatLogArgs(args))
    },
  }
}

export function removeLeadingSlash(path: string): string {
  return path.replace(/^\//, '')
}

export function removeTrailingSlash(s: string) {
  return s.replace(/\/$/, '')
}

export function determineInitialRoutePath(routePath: string) {
  const DISALLOWED_ESCAPE_CHARS = new Set([
    '/',
    '\\',
    '?',
    '#',
    ':',
    '*',
    '<',
    '>',
    '|',
    '!',
    '$',
    '%',
  ])

  const parts = routePath.split(/(?<!\[)\.(?!\])/g)

  // Escape any characters that in square brackets
  const escapedParts = parts.map((part) => {
    // Check if any disallowed characters are used in brackets
    const BRACKET_CONTENT_RE = /\[(.*?)\]/g

    let match
    while ((match = BRACKET_CONTENT_RE.exec(part)) !== null) {
      const character = match[1]
      if (character === undefined) continue
      if (DISALLOWED_ESCAPE_CHARS.has(character)) {
        console.error(
          `Error: Disallowed character "${character}" found in square brackets in route path "${routePath}".\nYou cannot use any of the following characters in square brackets: ${Array.from(
            DISALLOWED_ESCAPE_CHARS,
          ).join(', ')}\nPlease remove and/or replace them.`,
        )
        process.exit(1)
      }
    }

    // Since this split segment is safe at this point, we can
    // remove the brackets and replace them with the content inside
    return part.replace(/\[(.)\]/g, '$1')
  })

  // If the syntax for prefix/suffix is different, from the path
  // matching internals of router-core, we'd perform those changes here
  // on the `escapedParts` array before it is joined back together in
  // `final`

  const final = cleanPath(`/${escapedParts.join('/')}`) || ''

  return final
}

export function replaceBackslash(s: string) {
  return s.replaceAll(/\\/gi, '/')
}

export function routePathToVariable(routePath: string): string {
  const toVariableSafeChar = (char: string): string => {
    if (/[a-zA-Z0-9_]/.test(char)) {
      return char // Keep alphanumeric characters and underscores as is
    }

    // Replace special characters with meaningful text equivalents
    switch (char) {
      case '.':
        return 'Dot'
      case '-':
        return 'Dash'
      case '@':
        return 'At'
      case '(':
        return '' // Removed since route groups use parentheses
      case ')':
        return '' // Removed since route groups use parentheses
      case ' ':
        return '' // Remove spaces
      default:
        return `Char${char.charCodeAt(0)}` // For any other characters
    }
  }

  return (
    removeUnderscores(routePath)
      ?.replace(/\/\$\//g, '/splat/')
      .replace(/\$$/g, 'splat')
      .replace(/\$\{\$\}/g, 'splat')
      .replace(/\$/g, '')
      .split(/[/-]/g)
      .map((d, i) => (i > 0 ? capitalize(d) : d))
      .join('')
      .split('')
      .map(toVariableSafeChar)
      .join('')
      // .replace(/([^a-zA-Z0-9]|[.])/gm, '')
      .replace(/^(\d)/g, 'R$1') ?? ''
  )
}

export function removeUnderscores(s?: string) {
  return s?.replaceAll(/(^_|_$)/gi, '').replaceAll(/(\/_|_\/)/gi, '/')
}

export function capitalize(s: string) {
  if (typeof s !== 'string') return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function removeExt(d: string, keepExtension: boolean = false) {
  return keepExtension ? d : d.substring(0, d.lastIndexOf('.')) || d
}

/**
 * This function writes to a file if the content is different.
 *
 * @param filepath The path to the file
 * @param content Original content
 * @param incomingContent New content
 * @param callbacks Callbacks to run before and after writing
 * @returns Whether the file was written
 */
export async function writeIfDifferent(
  filepath: string,
  content: string,
  incomingContent: string,
  callbacks?: { beforeWrite?: () => void; afterWrite?: () => void },
): Promise<boolean> {
  if (content !== incomingContent) {
    callbacks?.beforeWrite?.()
    await fsp.writeFile(filepath, incomingContent)
    callbacks?.afterWrite?.()
    return true
  }
  return false
}

/**
 * This function formats the source code using the default formatter (Prettier).
 *
 * @param source The content to format
 * @param config The configuration object
 * @returns The formatted content
 */
export async function format(
  source: string,
  config: {
    quoteStyle: 'single' | 'double'
    semicolons: boolean
  },
): Promise<string> {
  const prettierOptions: prettier.Config = {
    semi: config.semicolons,
    singleQuote: config.quoteStyle === 'single',
    parser: 'typescript',
  }
  return prettier.format(source, prettierOptions)
}

/**
 * This function resets the regex index to 0 so that it can be reused
 * without having to create a new regex object or worry about the last
 * state when using the global flag.
 *
 * @param regex The regex object to reset
 * @returns
 */
export function resetRegex(regex: RegExp) {
  regex.lastIndex = 0
  return
}

/**
 * This function checks if a file exists.
 *
 * @param file The path to the file
 * @returns Whether the file exists
 */
export async function checkFileExists(file: string) {
  try {
    await fsp.access(file, fsp.constants.F_OK)
    return true
  } catch {
    return false
  }
}
