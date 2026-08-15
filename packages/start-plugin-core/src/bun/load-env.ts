import { existsSync, readFileSync } from 'node:fs'
import { join } from 'pathe'

/**
 * Vite-aligned `.env` loading (mode-aware, no prefix filter).
 * Later files override earlier ones; does not overwrite existing `process.env`.
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

  const loaded: Record<string, string> = {}

  for (const name of files) {
    const filePath = join(opts.root, name)
    if (!existsSync(filePath)) {
      continue
    }
    const text = readFileSync(filePath, 'utf8')
    Object.assign(loaded, parseEnvFile(text))
  }

  for (const [key, value] of Object.entries(loaded)) {
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }

  return loaded
}

export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }
    const eq = line.indexOf('=')
    if (eq <= 0) {
      continue
    }
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (key) {
      out[key] = value
    }
  }
  return out
}

/** Build Bun/Vite-style define entries from loaded env (both process.env + import.meta.env). */
export function createEnvDefine(
  env: Record<string, string>,
): Record<string, string> {
  const define: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    // Skip keys that would break JS identifiers in import.meta.env access patterns
    // still define process.env.* always; import.meta.env.* for alphanumeric keys.
    define[`process.env.${key}`] = JSON.stringify(value)
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      define[`import.meta.env.${key}`] = JSON.stringify(value)
    }
  }
  return define
}
