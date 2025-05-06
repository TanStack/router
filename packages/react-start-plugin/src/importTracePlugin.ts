import fs from 'node:fs/promises'
import path from 'node:path'
import { normalizePath } from 'vite'
import * as babel from '@babel/core'
import * as t from '@babel/types'
// import colors from 'ansis'
import { parseAst } from '@tanstack/router-utils'
import type { Plugin} from 'vite';

export function importTracePlugin(options?: {
  matchMessage?: (message: string) => boolean
  targetModules?: Array<string>
}): Plugin {
  const loadedFiles = new Set<string>()
  const parsedCache = new Map<string, t.File>()
  const root = process.cwd()
  const matchMessage =
    options?.matchMessage ?? ((msg) => msg.includes('is not exported by'))
  const targetModules = options?.targetModules ?? []

  return {
    name: 'tanstack:import-trace',
    apply: 'build',
    enforce: 'pre',
    applyToEnvironment (env) {
        // this restriction might not be needed  
        return env.config.consumer === 'client'
    },
    load(id) {
      loadedFiles.add(normalizePath(id))
      return undefined
    },
    async buildEnd(error) {
      if (!error) return
      if (!matchMessage(error.message)) return

      const trace = extractImportTrace(error.message)
      if (!trace) return

      const filesInTrace = trace.filter((file) =>
        loadedFiles.has(normalizePath(file)),
      )

      const parsedFiles = new Map<string, babel.types.File>()

      for (const file of filesInTrace) {
        if (parsedCache.has(file)) {
          parsedFiles.set(file, parsedCache.get(file)!)
          continue
        }

        try {
          const code = await fs.readFile(file, 'utf8')
          const ast = parseAst({ code, sourceFilename: file })
          parsedFiles.set(file, ast)
          parsedCache.set(file, ast)
        } catch (e) {
          this.warn(`Failed to parse ${file}: ${(e as Error).message}`)
        }
      }

      //console.error(`\n${colors.red('✖ Import trace for failed export:')}`)
      /*console.error(
        `${colors.bold('Problem in')}: ${error.id ? colors.cyan(relativePath(error.id, root)) : 'unknown'}`,
      )*/

      for (const file of trace) {
        const relative = relativePath(file, root)
        //console.error(`\n${colors.bold('→')} ${colors.dim(relative)}`)

        const ast = parsedFiles.get(normalizePath(file))
        if (ast) {
          const imports = collectOffendingImports(ast, file, targetModules)
          if (imports.length === 0) {
            //console.error(`   ${colors.dim('No matching imports found.')}`)
          } else {
            const seen = new Set<string>()
            for (const { source, loc } of imports) {
              const key = `${source}:${loc?.start.line}:${loc?.start.column}`
              if (seen.has(key)) continue
              seen.add(key)

              if (loc) {
                const link = `${relative}:${loc.start.line}:${loc.start.column + 1}`
                /*console.error(
                  `   ${colors.green('⚡')} from ${colors.yellow(source)} at ${colors.dim(link)}`,
                )*/
              } else {
                /*console.error(
                  `   ${colors.green('⚡')} from ${colors.yellow(source)}`,
                )*/
              }
            }
          }
        }
      }
    },
  }
}

function extractImportTrace(message: string): Array<string> | null {
  const lines = message.split('\n')
  const files: Array<string> = []

  for (const line of lines) {
    const match = line.match(/^\s*(?:→|↳)\s*(.*)$/)
    if (match) {
      // TODO fixme
      files.push(match[1]!)
    }
  }

  return files.length > 0 ? files : null
}

function collectOffendingImports(
  ast: babel.types.File,
  filename: string,
  targetModules: Array<string>,
): Array<{ source: string; loc: t.SourceLocation | null | undefined }> {
  const results: Array<{
    source: string
    loc: t.SourceLocation | null | undefined
  }> = []

  babel.traverse(ast, {
    ImportDeclaration(path) {
      const source = path.node.source.value
      if (matchesTarget(source, targetModules)) {
        results.push({ source, loc: path.node.loc })
      }
    },
    ExportNamedDeclaration(path) {
      const source = path.node.source?.value
      if (source && matchesTarget(source, targetModules)) {
        results.push({ source, loc: path.node.loc })
      }
    },
    ExportAllDeclaration(path) {
      const source = path.node.source.value
      if (matchesTarget(source, targetModules)) {
        results.push({ source, loc: path.node.loc })
      }
    },
    CallExpression(path) {
      if (
        t.isIdentifier(path.node.callee, { name: 'require' }) &&
        path.node.arguments.length === 1 &&
        t.isStringLiteral(path.node.arguments[0])
      ) {
        const source = path.node.arguments[0].value
        if (matchesTarget(source, targetModules)) {
          results.push({ source, loc: path.node.loc })
        }
      }
    },
  })

  return results
}

function matchesTarget(source: string, targetModules: Array<string>) {
  return targetModules.length === 0 || targetModules.includes(source)
}

function relativePath(file: string, root: string) {
  return normalizePath(path.relative(root, file))
}
