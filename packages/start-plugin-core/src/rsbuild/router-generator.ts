/**
 * The route generator of Start's Rsbuild plugin (J1.10, J2.15): one
 * `Generator` per plugin and its session (`createGeneratorSession`), run
 * once before a production run's environments compile (`build`, at the
 * session's `beginRun`), and as
 * a precondition of every watch compilation (`watchRun`, whose first one
 * starts the generator's own watcher for the files outside the bundle:
 * created route files, `physical()` mounts). It publishes the
 * route registry the router planner reads and serves the client's route
 * tree without its server-only routes.
 */
import path from 'node:path'
import {
  Generator,
  contentDigest,
  createGeneratorSession,
} from '@tanstack/router-generator'
import {
  changedRoutePaths,
  createRouterPluginContext,
  onRoutesChanged,
  publishRoutes,
} from '@tanstack/router-plugin/context'
import { RouteRegistryView } from '@tanstack/router-plugin/planners'
import { normalizePath } from '@tanstack/router-utils/compiler'
import { startGeneratorConfig } from '../start-router-plugin/generator-config'
import { createClientRouteTree } from '../start-router-plugin/client-route-tree'
import { createTreePaths } from '../start-router-plugin/tree-paths'
import type { ClientRouteTreeCode } from '../start-router-plugin/client-route-tree'
import type { GetConfigFn, TanStackStartCoreOptions } from '../types'
import type { TanStackStartRsbuildInputConfig } from './schema'
import type { RouteRegistry } from '@tanstack/router-utils/compiler'

/**
 * Development: what each compiler of the dev server was built from, against
 * what the generator has (the route-set reload, SPEC J3.10). Records are made
 * from the bytes Start's loader was handed and count from the compiler's emit:
 * what is served is what was emitted.
 */
export interface RouteSetEvidence {
  /**
   * The server compiler's loader was handed `source` for `resource` (the
   * root compiler, its first raw pass, no query); `first`: as the first
   * loader to read it. Recorded when the file is the tree or a route file.
   */
  built: (
    compiler: string,
    resource: string,
    source: string | Uint8Array,
    first: boolean,
  ) => void
  /** The client's tree module was handed `code`. */
  clientServed: (code: string) => void
  /** `compiler` emitted a compilation: what it built since its last emit is what it serves. */
  emitted: (compiler: string, client: boolean) => void
  /** A compilation of `compiler` failed fatally: what it built is in no output. */
  failed: (compiler: string, client: boolean) => void
  /** `compiler` finished a compilation, with errors or not. */
  done: (compiler: string, hasErrors: boolean) => void
  /**
   * The dev server closed: everything recorded is forgotten (the evidence
   * is of one dev server's compilers; the next one starts empty, with its
   * own first published tree).
   */
  reset: () => void
  /** The digest of the client's tree for the current publication (awaited before anything is compared). */
  current: () => Promise<string>
  /** Whether the last finished compilation of `compiler` had no errors (none finished: false). */
  clean: (compiler: string) => boolean
  /** The digest of the client tree the client compiler emitted last. */
  clientTree: () => string | undefined
  /**
   * Whether `compiler` serves what the generator has: its tree module was
   * built from the published tree (or through a loader that read it before
   * Start's, or restored with the first tree published), and every route
   * file it built of which the generator has bytes was built from them.
   */
  serverAgrees: (compiler: string) => boolean
}

export interface RsbuildRouteGenerator {
  /** Development: the evidence of the route-set reload. */
  evidence: RouteSetEvidence
  /** The route registry (a route file's entry by its scanned or real path). */
  routes: RouteRegistry
  /** A production run's generation, once for all its environments (the session's `beginRun`). */
  build: () => Promise<void>
  /** A watch compilation: the generator's own watcher from the first one, the compiler's file events after. */
  watchRun: (
    modified: ReadonlyArray<string>,
    removed: ReadonlyArray<string>,
  ) => Promise<void>
  close: () => Promise<void>
  /** Route files whose registry entry changed (the compilers invalidate their plans); gives the unsubscribe. */
  onRoutesChanged: (listener: (files: Array<string>) => void) => () => void
  /** The client's route tree module. */
  clientRouteTree: {
    /** The paths of the tree module (`createTreePaths`: configured, and real). */
    paths: () => ReadonlyArray<string>
    code: () => Promise<ClientRouteTreeCode>
  }
}

export function createRsbuildRouteGenerator(opts: {
  getConfig: GetConfigFn
  corePluginOpts: TanStackStartCoreOptions
  startPluginOpts: TanStackStartRsbuildInputConfig
}): RsbuildRouteGenerator {
  let generator: Generator | undefined
  // the published registry (the context dedupes an unchanged publication)
  const context = createRouterPluginContext()
  const registry = new RouteRegistryView(context)
  const treePath = () =>
    path.resolve(opts.getConfig().startConfig.router.generatedRouteTree)
  const treePaths = createTreePaths(treePath)

  /** Counts the changes of the client's route set (the routes the pruned tree keeps). */
  let clientRoutes = 0
  const clientRouteTree = createClientRouteTree({
    onClientRoutesChange: () => {
      clientRoutes++
    },
  })

  const instance = (): Generator => {
    if (generator) {
      return generator
    }
    generator = new Generator({
      config: startGeneratorConfig({
        getConfig: opts.getConfig,
        corePluginOpts: opts.corePluginOpts,
        prerender: opts.startPluginOpts.prerender?.enabled === true,
        clientRouteTree: clientRouteTree.plugin,
      }),
      root: opts.getConfig().resolvedStartConfig.root,
    })
    return generator
  }

  /**
   * The client's tree, printed once for its readers (the transform, each
   * compilation's check, the reload's evidence) while the generator's tree
   * and the client's route set are the ones it was printed from: the pruned
   * tree is a function of the tree's model, which changes with the full
   * tree's text or with the set of routes the client keeps. (The generator
   * session publishes at every watch compilation, changed or not.)
   */
  let clientTree:
    | { from: string; code: Promise<ClientRouteTreeCode> }
    | undefined
  const clientTreeCode = (): Promise<ClientRouteTreeCode> => {
    const from = `${generator?.treeDigest()}\0${clientRoutes}`
    if (clientTree?.from !== from) {
      const code = clientRouteTree.code()
      const printed = { from, code }
      code.catch(() => {
        // (asked again: once the tree is generated)
        if (clientTree === printed) {
          clientTree = undefined
        }
      })
      clientTree = printed
    }
    return clientTree.code
  }

  const evidence = createRouteSetEvidence({
    generator: () => generator,
    treePaths,
    clientTreeCode: async () => (await clientTreeCode()).code,
  })

  const session = createGeneratorSession({
    generator: instance,
    publish: (routesByFile, failure) => {
      publishRoutes(context, routesByFile, failure)
      evidence.published()
    },
  })

  return {
    evidence,
    routes: registry,
    build: () => session.build(),
    watchRun: (modified, removed) => session.watchRun(modified, removed),
    close: () => session.close(),
    onRoutesChanged(listener) {
      return onRoutesChanged(context, (next, previous) => {
        const changed = changedRoutePaths(next, previous)
        if (changed.length > 0) {
          listener(changed)
        }
      })
    },
    clientRouteTree: {
      paths: treePaths,
      code: clientTreeCode,
    },
  }
}

/** A file built here whose bytes Start's loader did not read first: known to be built, no evidence. */
const UNREAD = Symbol('unread')
type FileRecord = string | typeof UNREAD

function createRouteSetEvidence(opts: {
  generator: () => Generator | undefined
  treePaths: () => ReadonlyArray<string>
  clientTreeCode: () => Promise<string>
}): RouteSetEvidence & { published: () => void } {
  /** compiler name → file → the digest of what its loader was handed: `pending` until that compiler emits. */
  const pending = new Map<string, Map<string, FileRecord>>()
  const committed = new Map<string, Map<string, FileRecord>>()
  /** compiler name → its last finished compilation had errors. */
  const errored = new Map<string, boolean>()
  let clientPending: string | undefined
  let clientCommitted: string | undefined
  /** The tree the generator published first (a server that built no tree in this process restored it). */
  let treeAtStart: string | undefined
  /** Derived from the current publication, once when first asked. */
  let derived:
    | { trees: ReadonlyArray<string>; pruned: Promise<string> | undefined }
    | undefined
  const publication = () => {
    derived ??= { trees: opts.treePaths(), pruned: undefined }
    return derived
  }
  return {
    published() {
      derived = undefined
      if (treeAtStart === undefined && opts.generator()?.hasGenerated()) {
        treeAtStart = opts.generator()!.treeDigest()
      }
    },
    built(compiler, resource, source, first) {
      const generator = opts.generator()
      if (!generator) {
        return
      }
      const file = normalizePath(resource)
      if (
        !publication().trees.includes(file) &&
        !generator.getRoutesByFileMap().has(file)
      ) {
        return
      }
      let records = pending.get(compiler)
      if (!records) {
        records = new Map()
        pending.set(compiler, records)
      }
      records.set(
        file,
        first
          ? contentDigest(
              typeof source === 'string'
                ? source
                : Buffer.from(source).toString('utf8'),
            )
          : UNREAD,
      )
    },
    clientServed(code) {
      clientPending = contentDigest(code)
    },
    emitted(compiler, client) {
      const records = pending.get(compiler)
      if (records) {
        let to = committed.get(compiler)
        if (!to) {
          to = new Map()
          committed.set(compiler, to)
        }
        for (const [file, record] of records) {
          to.set(file, record)
        }
        pending.delete(compiler)
      }
      if (client && clientPending !== undefined) {
        clientCommitted = clientPending
        clientPending = undefined
      }
    },
    failed(compiler, client) {
      pending.delete(compiler)
      if (client) {
        clientPending = undefined
      }
    },
    done(compiler, hasErrors) {
      errored.set(compiler, hasErrors)
    },
    reset() {
      pending.clear()
      committed.clear()
      errored.clear()
      clientPending = undefined
      clientCommitted = undefined
      // (the next dev server's first tree, from its own first publication)
      treeAtStart = undefined
      derived = undefined
    },
    current() {
      const state = publication()
      state.pruned ??= opts
        .clientTreeCode()
        .then(contentDigest)
        .catch((error: unknown) => {
          // (asked again: the next publication's, or this one's once the tree is generated)
          state.pruned = undefined
          throw error
        })
      return state.pruned
    },
    clean: (compiler) => errored.get(compiler) === false,
    clientTree: () => clientCommitted,
    serverAgrees(compiler) {
      const generator = opts.generator()
      if (!generator) {
        return false
      }
      const records = committed.get(compiler)
      const { trees } = publication()
      const tree = generator.treeDigest()
      const builtTree = trees
        .map((file) => records?.get(file))
        .find((record) => record !== undefined)
      if (
        builtTree === undefined
          ? tree !== treeAtStart
          : builtTree !== UNREAD && builtTree !== tree
      ) {
        return false
      }
      for (const [file, record] of records ?? []) {
        if (record === UNREAD || trees.includes(file)) {
          continue
        }
        const now = generator.sourceDigest(file)
        if (now !== undefined && now !== record) {
          return false
        }
      }
      return true
    },
  }
}
