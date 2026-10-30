/**
 * The client build's check of what no single compile sees: a module whose
 * exports server code can still be attached to (a builder, a factory, a
 * start instance: `StartEnvFacts.leakProneExports`) is followed into each
 * importer that the compiler compiled and that imports it statically;
 * anything else (a dynamic import, a `require()` or glob, a module the
 * compiler does not compile, a namespace object passed where the analysis
 * does not follow it) could attach server code the client then ships. An
 * importer re-exporting one of those exports is followed the same way.
 * Start's own packages are not followed (their importers name them, and are
 * judged by the specifier). Shared by both hosts over their bundler's module
 * graph.
 */

/** What a client compile recorded for this check. */
export interface LeakFacts {
  leakProneExports: ReadonlyArray<string>
  /** Specifiers of namespace imports whose object escapes the analysis. */
  escapingNamespaces: ReadonlyArray<string>
  /** Specifiers the module loads with `import()` or `require()`. */
  dynamicImports: ReadonlyArray<string>
}

export const NO_LEAK_FACTS: LeakFacts = Object.freeze({
  leakProneExports: Object.freeze([]),
  escapingNamespaces: Object.freeze([]),
  dynamicImports: Object.freeze([]),
})

/** A re-export of a module: `export { from as name }`, `export * as name` (`from: null`), `export *` (`name: null`). */
export interface ReExport {
  specifier: string
  name: string | null
  from: string | null
}

/** A client module graph, by the bundler's ids. */
export interface ClientGraph {
  /** The importers of a module, each with whether the bundler saw it load it with `import()`. */
  importers: (id: string) => Iterable<{ id: string; dynamic: boolean }>
  /** What the compiler recorded for a module it compiled, or undefined. */
  facts: (id: string) => LeakFacts | undefined
  /** The re-exports of a module the compiler compiled. */
  reexports: (id: string) => Promise<ReadonlyArray<ReExport>>
  /** Whether a module belongs to one of Start's packages. */
  isStartPackage: (id: string) => Promise<boolean>
  /** The module `specifier` resolves to from `importer`, or null. */
  resolve: (specifier: string, importer: string) => Promise<string | null>
  /** A module's source text (null: no file). */
  read: (id: string) => Promise<string | null>
  /** How a module is named in a message (a path relative to the root). */
  name: (id: string) => string
}

/** Imports the analysis does not see as edges of the module. */
const OPAQUE_IMPORT_RE = /\brequire\s*\(|\bimport\.meta\.glob\b/

/** The messages of every importer of `modules` the compiler did not follow. */
export async function unfollowedImports(
  graph: ClientGraph,
  modules: Iterable<string>,
): Promise<Array<string>> {
  const exposing = new Map<string, ReadonlyArray<string>>()
  const queue: Array<string> = []
  const expose = (id: string, names: ReadonlyArray<string>) => {
    if (names.length > 0 && !exposing.has(id)) {
      exposing.set(id, names)
      queue.push(id)
    }
  }
  for (const id of modules) {
    const names = graph.facts(id)?.leakProneExports
    if (names && names.length > 0 && !(await graph.isStartPackage(id))) {
      expose(id, names)
    }
  }
  const problems: Array<string> = []
  // (an array iterator also visits what the loop pushes)
  for (const id of queue) {
    const names = exposing.get(id)!
    for (const importer of graph.importers(id)) {
      if (await graph.isStartPackage(importer.id)) {
        // Start's runtime (the client reads the start instance's options)
        continue
      }
      const facts = graph.facts(importer.id)
      let how: string | null = null
      if (!facts) {
        how = importer.dynamic
          ? 'loads it with `import()`'
          : 'is not compiled by the TanStack Start compiler (a virtual or generated module, or one it does not read)'
      } else if (
        importer.dynamic ||
        (await resolvesTo(graph, importer.id, facts.dynamicImports, id))
      ) {
        how = 'loads it with `import()` or `require()`'
      } else if (
        await resolvesTo(graph, importer.id, facts.escapingNamespaces, id)
      ) {
        how = 'passes its namespace object where the compiler cannot follow it'
      } else if (OPAQUE_IMPORT_RE.test((await graph.read(importer.id)) ?? '')) {
        how =
          'may load it through `require()` or `import.meta.glob`, which the compiler does not follow'
      } else {
        expose(importer.id, await reexported(graph, importer.id, id, names))
      }
      if (how !== null) {
        problems.push(
          `${graph.name(importer.id)} ${how}, but ${graph.name(id)} exports a TanStack Start builder or factory (${names.map((n) => `\`${n}\``).join(', ')}), so server code attached to it there would ship to the client. Import it statically, from a module the TanStack Start compiler compiles.`,
        )
      }
    }
  }
  return problems
}

/** The names under which `importer` re-exports what `target` exposes (`names`). */
async function reexported(
  graph: ClientGraph,
  importer: string,
  target: string,
  names: ReadonlyArray<string>,
): Promise<Array<string>> {
  const out: Array<string> = []
  for (const r of await graph.reexports(importer)) {
    if ((await graph.resolve(r.specifier, importer)) !== target) {
      continue
    }
    if (r.name === null) {
      out.push(...names)
    } else if (
      r.from === null ||
      names.includes(r.from) ||
      names.includes('*')
    ) {
      out.push(r.name)
    }
  }
  return out
}

/** Whether one of `specifiers`, as `importer` resolves it, is `target`. */
async function resolvesTo(
  graph: ClientGraph,
  importer: string,
  specifiers: ReadonlyArray<string>,
  target: string,
): Promise<boolean> {
  for (const specifier of specifiers) {
    if ((await graph.resolve(specifier, importer)) === target) {
      return true
    }
  }
  return false
}
