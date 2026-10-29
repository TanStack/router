/**
 * The server-function registry, shared by every env of a build or dev
 * session: per env, the server fns each defining module's last compile
 * reported (the snapshots; a compile replaces its module's, also with none),
 * and one entry per id over them. `clientReferenced`: a client-env snapshot
 * reports the id.
 */
import { deriveId } from '@tanstack/router-utils/compiler'
import type { ServerFnKey } from './ids'

export interface ServerFnEntry extends ServerFnKey {
  /** The id as printed in the outputs: a dev id, a default id or a placeholder. */
  id: string
  /** The export name of the `createServerRpc` wrapper in the provider module. */
  exportName: string
  /** The name the runtime shows (`serverFnMeta.name`). */
  name: string
  /** The defining module's canonical id (no owned query). */
  definingCanonicalId: string
  /** Whether a separate provider module (derived id) carries the handler. */
  providerDerived: boolean
  clientReferenced: boolean
}

/** What a compile reports about one server fn (planner facts; plain data). */
export interface ServerFnFact {
  rootRel: string
  stableKey: string
  id: string
  exportName: string
  name: string
  providerDerived: boolean
}

interface ServerFnEnv {
  name: string
  type: 'client' | 'server'
}

/** An environment's snapshots: the facts of each defining module (by canonical id) that reported some. */
interface EnvSnapshots {
  type: 'client' | 'server'
  modules: Map<string, ReadonlyArray<ServerFnFact>>
}

export class ServerFnRegistry {
  private readonly envs = new Map<string, EnvSnapshots>()
  /** The entries by id over every snapshot (rebuilt on the first read after a change). */
  private byId: Map<string, ServerFnEntry> | null = null

  clear(): void {
    this.envs.clear()
    this.byId = null
  }

  get(id: string): ServerFnEntry | undefined {
    return this.view().get(id)
  }

  entries(): Array<ServerFnEntry> {
    return [...this.view().values()]
  }

  /** Whether a compile of `definingCanonicalId` reported a function. */
  definedIn(definingCanonicalId: string): boolean {
    for (const env of this.envs.values()) {
      if (env.modules.has(definingCanonicalId)) {
        return true
      }
    }
    return false
  }

  /** Replaces the snapshot of `definingCanonicalId` in an env with the facts of its compile (`null`: none). */
  set(
    env: ServerFnEnv,
    definingCanonicalId: string,
    facts: ReadonlyArray<ServerFnFact> | null,
  ): void {
    let snapshots = this.envs.get(env.name)
    if (snapshots?.modules.get(definingCanonicalId) === (facts ?? undefined)) {
      return
    }
    if (!snapshots) {
      snapshots = { type: env.type, modules: new Map() }
      this.envs.set(env.name, snapshots)
    }
    if (facts) {
      snapshots.modules.set(definingCanonicalId, facts)
    } else {
      snapshots.modules.delete(definingCanonicalId)
    }
    this.byId = null
  }

  /** Replaces every snapshot of an env (the Rsbuild replay of a compilation's modules). */
  replace(
    env: ServerFnEnv,
    modules: Map<string, ReadonlyArray<ServerFnFact>>,
  ): void {
    this.envs.set(env.name, { type: env.type, modules })
    this.byId = null
  }

  /** Forgets the snapshots of a file (a deleted file; by path, every query variant). */
  forget(path: string): void {
    for (const env of this.envs.values()) {
      for (const id of env.modules.keys()) {
        if (id.split('?')[0] === path) {
          env.modules.delete(id)
          this.byId = null
        }
      }
    }
  }

  private view(): Map<string, ServerFnEntry> {
    if (this.byId) {
      return this.byId
    }
    const byId = new Map<string, ServerFnEntry>()
    for (const env of this.envs.values()) {
      for (const [definingCanonicalId, facts] of env.modules) {
        for (const f of facts) {
          byId.set(f.id, {
            rootRel: f.rootRel,
            stableKey: f.stableKey,
            id: f.id,
            exportName: f.exportName,
            name: f.name,
            definingCanonicalId,
            providerDerived: f.providerDerived,
            clientReferenced:
              (byId.get(f.id)?.clientReferenced ?? false) ||
              env.type === 'client',
          })
        }
      }
    }
    this.byId = byId
    return byId
  }
}

/** The module an entry's `createServerRpc` wrapper is exported from. */
export function providerModuleId(entry: ServerFnEntry): string {
  return entry.providerDerived
    ? deriveId(entry.definingCanonicalId, { kind: 'provider', value: '' })
    : entry.definingCanonicalId
}
