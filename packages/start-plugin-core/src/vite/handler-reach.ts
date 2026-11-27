import { promises as fs } from 'node:fs'
import {
  identify,
  isAnalyzableSpecifier,
} from '@tanstack/router-utils/compiler'
import type { HostServices } from '@tanstack/router-utils/compiler'
import type { Session, ViteStartEnvironment } from './compiler-state'

/**
 * A module naming neither the server-fn factory nor `handler` defines no
 * server function (a text gate before any analysis; the planner decides the
 * rest, whatever the spelling of the call: `.handler<T>(`, `(b.handler)(`,
 * `.handler!(`, a comment between).
 */
const SERVER_FN_TEXT_RE = /createServerFn|\bhandler\b/

/**
 * A separate provider's build (RSC; plugin-rsc's `buildApp` builds the
 * provider before the client, after scanning the provider and the SSR
 * environments). The provider's graph unfolds from its manifest, which
 * lists the server functions the scans registered. The SSR scan compiles
 * a server-fn module as a caller: its handlers are deleted, with the
 * imports only they read, so a `'use client'` component a handler renders
 * (through a server component) and the server-fn modules that component
 * imports are seen by no environment before the client builds: their
 * functions were missing from the manifest (J4.2, #7943). Before the
 * provider's real build, the raw reach of every registered server-fn
 * module (static and lazy imports, the modules of the project and of
 * packages that declare Start, what the deleted
 * handlers read included) is walked, and each module that may define a
 * server function is compiled in the provider environment, outside any
 * transform, so the manifest lists its functions; the build then imports
 * and compiles it in place (the plans are reused).
 *
 * At and below a `'use client'` module (the directive in its parsed
 * prologue, `TargetFacts.useClient`) only static imports are followed: a
 * client component's `import()` loads in the browser, often in a
 * development-only branch whose module has dependencies the provider
 * cannot resolve in production (a package with a `development` export
 * only), which failed the provider's build. What that gives up: a server fn
 * a client component imports lazily (`onClick={() =>
 * import('./fn').then((m) => m.fn())}`) is not in the manifest and answers
 * `Server function info not found`, as on main.
 */
export async function compileHandlerReach(
  s: Session,
  env: ViteStartEnvironment,
  host: HostServices,
): Promise<void> {
  const { registry, rawFacts } = s.start
  // module → whether it was reached only at or below a client boundary (a
  // module reached again from server code is walked again, lazily too)
  const seen = new Map<string, boolean>()
  const queue = registry
    .entries()
    .map((e) => ({ id: e.definingCanonicalId, client: false }))
  while (queue.length > 0) {
    const { id, client: reachedClient } = queue.pop()!
    const before = seen.get(id)
    if (before === false || (before && reachedClient)) {
      continue
    }
    seen.set(id, reachedClient)
    const identity = identify(id)
    // (an ordinary package's modules are not walked: the package class
    // decides the reach, not the summaries)
    if (!s.start.classes.readsOnDemand(identity.path)) {
      continue
    }
    const facts = await rawFacts.get(identity.canonicalId, env.name)
    if (!facts.targetFacts.exists) {
      continue
    }
    const client = reachedClient || facts.targetFacts.useClient
    if (before === undefined && !registry.definedIn(identity.canonicalId)) {
      const code = await fs.readFile(identity.path, 'utf8').catch(() => null)
      // the cheap text gate of a module that may define a server function
      if (code !== null && SERVER_FN_TEXT_RE.test(code)) {
        // (the compile registers the module's functions)
        await s.start.compile(
          {
            id: identity.canonicalId,
            code,
            env,
            inputMap: () => null,
            wantMap: false,
          },
          host,
        )
      }
    }
    for (const spec of client
      ? facts.targetFacts.imports
      : [...facts.targetFacts.imports, ...facts.targetFacts.lazyImports]) {
      if (rawFacts.isKnownSpecifier(spec) || !isAnalyzableSpecifier(spec)) {
        continue
      }
      const r = await host.resolve(spec, identity.canonicalId)
      if (r && !r.external) {
        queue.push({ id: identify(r.id).canonicalId, client })
      }
    }
  }
}
