/**
 * The server-function registry (DESIGN §3.13.2): one entry per server fn a
 * compile reported, shared by every env of a build or dev session.
 * `clientReferenced` is set only by client-env compiles.
 */
import { placeholderToken } from './ids'
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

export class ServerFnRegistry {
  private readonly byId = new Map<string, ServerFnEntry>()

  clear(): void {
    this.byId.clear()
  }

  get(id: string): ServerFnEntry | undefined {
    return this.byId.get(id)
  }

  entries(): Array<ServerFnEntry> {
    return [...this.byId.values()]
  }

  /** Whether a compile of `definingCanonicalId` recorded a function. */
  definedIn(definingCanonicalId: string): boolean {
    for (const e of this.byId.values()) {
      if (e.definingCanonicalId === definingCanonicalId) {
        return true
      }
    }
    return false
  }

  /** Records the facts of a compile of `definingCanonicalId` in an env of `type`. */
  record(
    definingCanonicalId: string,
    facts: ReadonlyArray<ServerFnFact>,
    envType: 'client' | 'server',
  ): void {
    for (const f of facts) {
      const prev = this.byId.get(f.id)
      this.byId.set(f.id, {
        rootRel: f.rootRel,
        stableKey: f.stableKey,
        id: f.id,
        exportName: f.exportName,
        name: f.name,
        definingCanonicalId,
        providerDerived: f.providerDerived,
        clientReferenced:
          (prev?.clientReferenced ?? false) || envType === 'client',
      })
    }
  }

  /** Forgets the entries defined by a file (a deleted file; by path, every query variant). */
  forget(path: string): void {
    for (const [id, e] of this.byId) {
      if (e.definingCanonicalId.split('?')[0] === path) {
        this.byId.delete(id)
      }
    }
  }

  tokenOf(entry: ServerFnEntry): string {
    return placeholderToken(entry)
  }
}
