/**
 * The modules Start generates for a compiler (the client's route tree, the
 * server-function resolver, the Start manifest): each is built from a
 * content Start publishes, and carries the digest of the content it was
 * built from in its `buildInfo` (`GENERATED_FIELD`, written by Start's
 * loader, the first of Start's code to read the module's bytes; Rspack
 * persists it with the module). One rule for all of them, in every
 * compilation (a first one that restored the module, a rebuild, a child
 * compiler's): the module is current when it was built from the content
 * published now; otherwise it is built again in place. No counter and no
 * memory of what this process built decides it.
 */
import { contentDigest } from '@tanstack/router-generator'
import { rebuildModulesWhere } from '@tanstack/router-utils/compiler'
import type { Rspack } from '@rsbuild/core'

/** The `buildInfo` field of a generated module: the digest of the content it was built from. */
export const GENERATED_FIELD = 'tanstack.start.generated'

/**
 * What a compiler's generated modules were last built from in this process,
 * by file: an index of the modules' own records (the loader writes both),
 * so that a compilation whose module is current reads no module. A module
 * the index does not know (restored from the persistent cache, a child
 * compiler's) is read from the compilation.
 */
export class GeneratedIndex {
  private readonly digests = new Map<string, string>()

  private key(compiler: string, file: string): string {
    return `${compiler}\0${file}`
  }

  /** Start's loader: `compiler`'s module of `file` is being built from `content`; records it on the module too. */
  built(
    compiler: string,
    file: string,
    buildInfo: Record<string, unknown> | undefined,
    content: string,
    child: boolean,
  ): void {
    const digest = contentDigest(content)
    if (buildInfo) {
      buildInfo[GENERATED_FIELD] = digest
    }
    if (!child) {
      this.digests.set(this.key(compiler, file), digest)
    }
  }

  /** Whether `compiler`'s module at one of `files` is known to be built from `digest`. */
  knows(compiler: string, files: Iterable<string>, digest: string): boolean {
    for (const file of files) {
      if (this.digests.get(this.key(compiler, file)) === digest) {
        return true
      }
    }
    return false
  }

  /** The modules of `compiler` at `files` were read from a compilation: built from `digest`. */
  read(compiler: string, files: Iterable<string>, digest: string): void {
    for (const file of files) {
      this.digests.set(this.key(compiler, file), digest)
    }
  }
}

interface ModuleLike {
  resource?: string
  buildInfo?: Record<string, unknown>
}

/** The generated module(s) a check is about: the compiler's, at these files (as a loader context spells them). */
export interface GeneratedTarget {
  index: GeneratedIndex
  compiler: string
  files: ReadonlyArray<string>
  /** Whether a module of the compilation (by resource) is one of them. */
  is: (resource: string) => boolean
}

/** Whether every module of `compilation` that `target` names was built from `content`. */
export function builtFrom(
  compilation: Rspack.Compilation,
  target: GeneratedTarget,
  content: string,
): boolean {
  const digest = contentDigest(content)
  const own = compilation.compiler.isChild() === false
  if (own && target.index.knows(target.compiler, target.files, digest)) {
    return true
  }
  let any = false
  for (const m of compilation.modules) {
    const module = m as ModuleLike
    if (module.resource !== undefined && target.is(module.resource)) {
      if (module.buildInfo?.[GENERATED_FIELD] !== digest) {
        return false
      }
      any = true
    }
  }
  // (a compilation without the module, one that failed before it reached
  // it, says nothing of what the module is built from)
  if (own && any) {
    target.index.read(target.compiler, target.files, digest)
  }
  return true
}

/**
 * Builds again, in place, the modules of `compilation` that `target` names
 * and that were built from another content than `content`; whether it
 * built any.
 */
export async function buildGenerated(
  compilation: Rspack.Compilation,
  target: GeneratedTarget,
  content: string,
): Promise<boolean> {
  if (builtFrom(compilation, target, content)) {
    return false
  }
  const digest = contentDigest(content)
  await rebuildModulesWhere(
    compilation as never,
    (m: ModuleLike) =>
      m.resource !== undefined &&
      target.is(m.resource) &&
      m.buildInfo?.[GENERATED_FIELD] !== digest,
  )
  return true
}
