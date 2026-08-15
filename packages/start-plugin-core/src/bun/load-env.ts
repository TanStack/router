import { existsSync, readFileSync } from 'node:fs'
import { join } from 'pathe'

/**
 * Vite-aligned `.env` loading (mode-aware).
 * Later files override earlier ones. Existing `process.env` wins over file values
 * in the returned map (and is never overwritten).
 */
export function loadBunEnvFiles(opts: {
  root: string
  mode: 'development' | 'production' | string
}): Record<string, string> {
  const files = [
    `.env`,
    `.env.local`,
    `.env.${opts.mode}`,
    `.env.${opts.mode}.local`,
  ]

  const fromFiles: Record<string, string> = {}

  for (const name of files) {
    const filePath = join(opts.root, name)
    if (!existsSync(filePath)) {
      continue
    }
    const text = readFileSync(filePath, 'utf8')
    Object.assign(fromFiles, parseEnvFile(text))
  }

  expandEnvVariables(fromFiles)

  for (const [key, value] of Object.entries(fromFiles)) {
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }

  // Effective map for defines: process.env wins; include public keys that exist
  // only in the process environment (never written from a file).
  const effective: Record<string, string> = { ...fromFiles }
  for (const key of Object.keys(fromFiles)) {
    const processValue = process.env[key]
    if (processValue !== undefined) {
      effective[key] = processValue
    }
  }
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) {
      continue
    }
    if (isPublicEnvKey(key) && effective[key] === undefined) {
      effective[key] = value
    }
  }

  return effective
}

/**
 * Parse a `.env` file with Vite/dotenv-aligned basics:
 * `export` prefix, inline comments (unquoted), escaped quotes, multiline
 * double-quoted values, and `${VAR}` / `$VAR` expansion (via expandEnvVariables).
 */
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  const lines = text.split(/\r?\n/)
  let i = 0

  while (i < lines.length) {
    let line = lines[i]!
    i += 1

    const trimmedStart = line.trimStart()
    if (!trimmedStart || trimmedStart.startsWith('#')) {
      continue
    }

    line = trimmedStart.replace(/^export\s+/, '')
    const eq = line.indexOf('=')
    if (eq <= 0) {
      continue
    }

    const key = line.slice(0, eq).trim()
    if (!key || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue
    }

    let rawValue = line.slice(eq + 1)
    let value = ''

    const trimmedValue = rawValue.trimStart()
    if (trimmedValue.startsWith('"')) {
      // Double-quoted: may span lines; support \\ \" \n \r \t
      let body = trimmedValue.slice(1)
      let closed = false
      while (true) {
        let escaped = false
        let end = -1
        for (let j = 0; j < body.length; j++) {
          const ch = body[j]!
          if (escaped) {
            escaped = false
            continue
          }
          if (ch === '\\') {
            escaped = true
            continue
          }
          if (ch === '"') {
            end = j
            break
          }
        }
        if (end >= 0) {
          value += unescapeDoubleQuoted(body.slice(0, end))
          closed = true
          break
        }
        value += unescapeDoubleQuoted(body) + '\n'
        if (i >= lines.length) {
          break
        }
        body = lines[i]!
        i += 1
      }
      if (!closed) {
        // Unterminated — keep what we have
      }
    } else if (trimmedValue.startsWith("'")) {
      // Single-quoted: no escapes except closing quote; single line for v1
      const end = trimmedValue.indexOf("'", 1)
      value =
        end >= 0 ? trimmedValue.slice(1, end) : trimmedValue.slice(1)
    } else {
      // Unquoted: strip inline comments after unescaped space+#
      value = stripInlineComment(rawValue.trim())
    }

    out[key] = value
  }

  return out
}

function stripInlineComment(value: string): string {
  let inSingle = false
  let inDouble = false
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]!
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle
      continue
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble
      continue
    }
    if (!inSingle && !inDouble && ch === '#') {
      // Comment only if preceded by whitespace (or start)
      if (i === 0 || /\s/.test(value[i - 1]!)) {
        return value.slice(0, i).trimEnd()
      }
    }
  }
  return value
}

function unescapeDoubleQuoted(value: string): string {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
}

/** Expand `$VAR` / `${VAR}` using values already in the map, then `process.env`. */
export function expandEnvVariables(
  env: Record<string, string>,
): Record<string, string> {
  const lookup = (name: string): string => {
    if (Object.prototype.hasOwnProperty.call(env, name)) {
      return env[name]!
    }
    return process.env[name] ?? ''
  }

  for (const [key, raw] of Object.entries(env)) {
    env[key] = raw.replace(
      /\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
      (_m, braced: string | undefined, bare: string | undefined) =>
        lookup(braced ?? bare ?? ''),
    )
  }
  return env
}

/** Keys safe to inline into the browser bundle (Vite-aligned public prefixes). */
export function isPublicEnvKey(key: string): boolean {
  return (
    key.startsWith('VITE_') ||
    key.startsWith('PUBLIC_') ||
    key.startsWith('TSS_PUBLIC_')
  )
}

/** Build Bun/Vite-style define entries from loaded env (both process.env + import.meta.env). */
export function createEnvDefine(
  env: Record<string, string>,
  opts?: { publicOnly?: boolean },
): Record<string, string> {
  const define: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (opts?.publicOnly && !isPublicEnvKey(key)) {
      continue
    }
    // Skip keys that would break JS identifiers in import.meta.env access patterns
    // still define process.env.* always; import.meta.env.* for alphanumeric keys.
    define[`process.env.${key}`] = JSON.stringify(value)
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      define[`import.meta.env.${key}`] = JSON.stringify(value)
    }
  }
  return define
}
