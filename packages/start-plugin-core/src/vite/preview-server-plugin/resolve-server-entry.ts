import { existsSync, readdirSync } from 'node:fs'
import { basename, extname, join } from 'pathe'
import { getBundlerOptions } from '../../utils'
import type * as vite from 'vite'

const SERVER_ENTRY_EXTENSIONS = ['.js', '.mjs', '.cjs']

/**
 * Resolve the server entry file that the build actually emitted into
 * `serverOutputDir`.
 *
 * The emitted filename is not always `<serverInputBasename>.js`: a configured
 * `output.entryFileNames`, or a builder plugin producing the server bundle, can
 * change both the name and the extension. Instead of reconstructing the name
 * and pinning `.js`, resolve the file that is present on disk. If none of the
 * candidates exist, throw an error that names what was looked for and what the
 * output directory actually contains.
 */
export function resolveServerEntry(
  serverBuild: vite.BuildEnvironmentOptions | undefined,
  serverOutputDir: string,
): string {
  const bundlerOptions = getBundlerOptions(serverBuild)
  const serverInput = bundlerOptions?.input ?? 'server'

  if (typeof serverInput !== 'string') {
    throw new Error('Invalid server input. Expected a string.')
  }

  const inputName = basename(serverInput, extname(serverInput))

  const output = Array.isArray(bundlerOptions?.output)
    ? bundlerOptions.output[0]
    : bundlerOptions?.output
  const entryFileNames = output?.entryFileNames

  const candidates = new Set<string>()

  // Prefer the configured output name, resolving the `[name]` placeholder.
  // Other placeholders (`[hash]` etc.) cannot be known here and are skipped.
  if (typeof entryFileNames === 'string') {
    const resolved = entryFileNames.replaceAll('[name]', inputName)
    if (!resolved.includes('[')) {
      candidates.add(resolved)
    }
  }

  // Fall back to the input basename with the common output extensions.
  for (const extension of SERVER_ENTRY_EXTENSIONS) {
    candidates.add(`${inputName}${extension}`)
  }

  for (const candidate of candidates) {
    const candidatePath = join(serverOutputDir, candidate)
    if (existsSync(candidatePath)) {
      return candidatePath
    }
  }

  const present = existsSync(serverOutputDir) ? readdirSync(serverOutputDir) : []

  throw new Error(
    `Could not find the server entry for prerendering in "${serverOutputDir}". ` +
      `Looked for: ${Array.from(candidates).join(', ')}. ` +
      `Files present: ${present.join(', ') || '(none)'}.`,
  )
}
