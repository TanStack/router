import { promises as fs } from 'node:fs'
import {
  identify,
  isAnalyzableSpecifier,
} from '@tanstack/router-utils/compiler'
import { NODE_MODULES_RE } from '../compiler/scope'
import type { HostServices } from '@tanstack/router-utils/compiler'
import type { Session, ViteStartEnvironment } from './compiler-state'

/** A module naming no server-fn factory nor `.handler(` defines no server function (a text gate before any analysis). */
const SERVER_FN_TEXT_RE = /createServerFn|\.handler\s*\(/

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
 * module (static and lazy imports, project modules only, what the deleted
 * handlers read included) is walked, and each module that may define a
 * server function is compiled in the provider environment, outside any
 * transform, so the manifest lists its functions; the build then imports
 * and compiles it in place (the plans are reused).
 */
export async function compileHandlerReach(
  s: Session,
  env: ViteStartEnvironment,
  host: HostServices,
): Promise<void> {
  const { registry, rawFacts } = s.start
  const seen = new Set<string>()
  const queue = registry.entries().map((e) => e.definingCanonicalId)
  while (queue.length > 0) {
    const id = queue.pop()!
    if (seen.has(id)) {
      continue
    }
    seen.add(id)
    const identity = identify(id)
    if (NODE_MODULES_RE.test(identity.path)) {
      continue
    }
    const facts = await rawFacts.get(identity.canonicalId, env.name)
    if (!facts.targetFacts.exists) {
      continue
    }
    if (!registry.definedIn(identity.canonicalId)) {
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
    for (const spec of [
      ...facts.targetFacts.imports,
      ...facts.targetFacts.lazyImports,
    ]) {
      if (rawFacts.isKnownSpecifier(spec) || !isAnalyzableSpecifier(spec)) {
        continue
      }
      const r = await host.resolve(spec, identity.canonicalId)
      if (r && !r.external) {
        queue.push(identify(r.id).canonicalId)
      }
    }
  }
}
