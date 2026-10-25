/**
 * The project's `compilerOptions.verbatimModuleSyntax` (J6.2): when
 * TypeScript keeps imports whose bindings are unused or only used as types,
 * such imports are edges import protection judges; otherwise TypeScript
 * erases them before bundling and judging them would report false positives.
 * Read from `<root>/tsconfig.json`, following `extends` (relative paths and
 * packages), as Vite's own TypeScript transform does. Comments and trailing
 * commas are allowed, as TypeScript allows them.
 */
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const MAX_EXTENDS_DEPTH = 16

interface TsconfigLike {
  extends?: string | Array<string>
  compilerOptions?: { verbatimModuleSyntax?: unknown }
}

/** JSON with comments and trailing commas → a value, or null when unreadable. */
export function parseJsonc(text: string): unknown {
  let out = ''
  let i = 0
  while (i < text.length) {
    const c = text[i]!
    if (c === '"') {
      let j = i + 1
      while (j < text.length && text[j] !== '"') {
        j += text[j] === '\\' ? 2 : 1
      }
      out += text.slice(i, j + 1)
      i = j + 1
      continue
    }
    if (c === '/' && text[i + 1] === '/') {
      const end = text.indexOf('\n', i)
      i = end === -1 ? text.length : end
      continue
    }
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2)
      i = end === -1 ? text.length : end + 2
      continue
    }
    out += c
    i++
  }
  // trailing commas before a closing bracket
  out = out.replace(/,(\s*[}\]])/g, '$1')
  try {
    return JSON.parse(out)
  } catch {
    return null
  }
}

function readTsconfig(file: string): TsconfigLike | null {
  let text: string
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch {
    return null
  }
  const value = parseJsonc(text)
  return value && typeof value === 'object' ? (value as TsconfigLike) : null
}

/** The file an `extends` entry names, resolved from the extending file's directory. */
function resolveExtends(spec: string, fromDir: string): string | null {
  if (spec.startsWith('.') || path.isAbsolute(spec)) {
    const p = path.resolve(fromDir, spec)
    for (const candidate of [p, `${p}.json`, path.join(p, 'tsconfig.json')]) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate
      }
    }
    return null
  }
  const require = createRequire(path.join(fromDir, 'noop.js'))
  for (const candidate of [spec, `${spec}.json`, `${spec}/tsconfig.json`]) {
    try {
      return require.resolve(candidate)
    } catch {
      // next form
    }
  }
  return null
}

/**
 * `compilerOptions.verbatimModuleSyntax` of `<root>/tsconfig.json`, through
 * its `extends` chain (the nearest setting wins); false when there is no
 * tsconfig or none sets it.
 */
export function readVerbatimModuleSyntax(root: string): boolean {
  const seen = new Set<string>()
  const visit = (file: string, depth: number): boolean | undefined => {
    if (depth > MAX_EXTENDS_DEPTH || seen.has(file)) {
      return undefined
    }
    seen.add(file)
    const config = readTsconfig(file)
    if (!config) {
      return undefined
    }
    const own = config.compilerOptions?.verbatimModuleSyntax
    if (typeof own === 'boolean') {
      return own
    }
    const bases =
      typeof config.extends === 'string'
        ? [config.extends]
        : Array.isArray(config.extends)
          ? config.extends.filter((e): e is string => typeof e === 'string')
          : []
    // later entries of an `extends` array override earlier ones
    for (const base of [...bases].reverse()) {
      const resolved = resolveExtends(base, path.dirname(file))
      const value = resolved ? visit(resolved, depth + 1) : undefined
      if (value !== undefined) {
        return value
      }
    }
    return undefined
  }
  return visit(path.join(root, 'tsconfig.json'), 0) === true
}
