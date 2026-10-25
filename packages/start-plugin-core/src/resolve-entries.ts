import { realpathSync, statSync } from 'node:fs'
import { join, normalize } from 'pathe'

interface ResolveModuleOptions {
  baseName: string
  from: string
}

const extensions = ['', '.ts', '.js', '.mts', '.mjs', '.tsx', '.jsx']

/** The first existing file of `from/baseName` + each extension, by its real path. */
function resolveModule(opts: ResolveModuleOptions): string | undefined {
  const base = join(opts.from, opts.baseName)
  for (const extension of extensions) {
    const file = base + extension
    if (statSync(file, { throwIfNoEntry: false })?.isFile()) {
      return normalize(realpathSync(file))
    }
  }
  return undefined
}

export function resolveEntry<
  TRequired extends boolean,
  TReturn = TRequired extends true ? string : string | undefined,
>(opts: {
  type: string
  configuredEntry?: string
  defaultEntry: string
  resolvedSrcDirectory: string
  required: TRequired
}): TReturn {
  let resolveOptions: ResolveModuleOptions

  // if entry was not configured, use default relative to srcDirectory
  if (!opts.configuredEntry) {
    resolveOptions = {
      baseName: opts.defaultEntry,
      from: opts.resolvedSrcDirectory,
    }
  } else {
    resolveOptions = {
      baseName: opts.configuredEntry,
      from: opts.resolvedSrcDirectory,
    }
  }

  const resolvedEntry = resolveModule(resolveOptions)
  if (opts.required && !resolvedEntry) {
    throw new Error(
      `Could not resolve entry for ${opts.type}: ${resolveOptions.baseName} in ${resolveOptions.from}`,
    )
  }
  return resolvedEntry as TReturn
}
