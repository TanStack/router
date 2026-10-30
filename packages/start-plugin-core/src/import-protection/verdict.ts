/**
 * Build verdicts: every violating edge of a
 * build is substituted by its mock edge module; after tree-shaking the host
 * reads which edge modules survived (`witness.ts`) and `decide` asks
 * `onViolation` once per surviving logical edge per logical build. A veto
 * (`false`) switches that edge's modules to the allowed state (a
 * transparent re-export of the real module) and asks for another pass of
 * the environment, until a pass vetoes nothing new (fixed point). Reports
 * are those of the final pass; nothing is published before.
 */
import type { EdgeViolation } from './violations'
import type { IndexedEdge } from './graph-trace'

type EdgeState = 'mock' | 'allowed'

export interface DecideResult {
  /** The environment must be built again (a new veto). */
  needPass: boolean
}

/**
 * One environment's verdict state for one logical build (all its passes).
 * A watch rebuild is a new logical build (`beginLogicalBuild`).
 */
export class BuildVerdicts {
  private readonly states = new Map<string, EdgeState>()
  private readonly verdicts = new Map<string, boolean | void>()
  private readonly asked = new Map<string, Promise<boolean | void>>()
  private _needPass = false
  private _passes = 0
  private _reports: Array<EdgeViolation> = []

  /** Called by the host when the edge state of `edgeKey` changed (Rspack rewrites its virtual files). */
  onStateChange: ((edgeKey: string, state: EdgeState) => void) | null = null

  beginLogicalBuild(): void {
    for (const key of [...this.states.keys()]) {
      if (this.states.get(key) !== 'mock') {
        this.states.set(key, 'mock')
        this.onStateChange?.(key, 'mock')
      }
    }
    this.states.clear()
    this.verdicts.clear()
    this.asked.clear()
    this._needPass = false
    this._passes = 0
    this._reports = []
  }

  stateOf(edgeKey: string): EdgeState {
    return this.states.get(edgeKey) ?? 'mock'
  }

  get needPass(): boolean {
    return this._needPass
  }

  get passes(): number {
    return this._passes
  }

  /** The reports of the settled build (empty while a pass is pending). */
  get reports(): ReadonlyArray<EdgeViolation> {
    return this._reports
  }

  /**
   * One pass's decision. `live` are the violations of the surviving edge
   * modules (several per logical edge when several outputs import it);
   * `ask` calls `onViolation` for one of them, at most once per logical edge
   * for the whole logical build.
   */
  async decide(
    live: ReadonlyArray<EdgeViolation>,
    ask: (violation: EdgeViolation) => Promise<boolean | void>,
  ): Promise<DecideResult> {
    this._passes++
    const byKey = new Map<string, EdgeViolation>()
    for (const v of live) {
      if (!byKey.has(v.edgeKey)) {
        byKey.set(v.edgeKey, v)
      }
    }
    const keys = [...byKey.keys()].sort()
    let newVeto = false
    for (const key of keys) {
      if (!this.verdicts.has(key)) {
        let p = this.asked.get(key)
        if (!p) {
          p = ask(byKey.get(key)!)
          this.asked.set(key, p)
        }
        this.verdicts.set(key, await p)
      }
      if (this.verdicts.get(key) === false && this.stateOf(key) === 'mock') {
        this.states.set(key, 'allowed')
        this.onStateChange?.(key, 'allowed')
        newVeto = true
      }
    }
    this._needPass = newVeto
    this._reports = newVeto
      ? []
      : keys
          .filter((k) => this.verdicts.get(k) !== false)
          .map((k) => byKey.get(k)!)
    return { needPass: this._needPass }
  }

  /**
   * Switches `edgeKey` to the allowed state in the pass that vetoed another
   * key (a module a vetoed import brings into the environment is allowed
   * there itself: `ImportProtectionEnv.decide`).
   */
  allow(edgeKey: string): void {
    if (this.stateOf(edgeKey) === 'mock') {
      this.states.set(edgeKey, 'allowed')
      this.onStateChange?.(edgeKey, 'allowed')
    }
  }

  /**
   * The fixed-point driver for hosts that rebuild an environment themselves
   * (Vite: `builder.build(env)` again from Start's build loop). `build` runs
   * one pass, whose witness reader calls `decide`.
   */
  async runToFixedPoint(
    build: () => Promise<unknown>,
    maxPasses = 10,
  ): Promise<void> {
    for (let i = 0; ; i++) {
      await build()
      if (!this._needPass) {
        return
      }
      if (i + 1 >= maxPasses) {
        throw new Error(
          `[import-protection] the build did not settle after ${maxPasses} passes (each pass allowed new imports through onViolation)`,
        )
      }
    }
  }
}

/** The `buildInfo` key of the import-protection records of a module (Rspack persistent cache). */
export const RSPACK_BUILD_INFO_KEY = 'tanstack.start.ip'

/**
 * What the Rspack loader stores in an importer's `buildInfo[RSPACK_BUILD_INFO_KEY]`
 * (plain JSON, restored with the module by the persistent cache) and what
 * `finishMake` replays into the environment (`ImportProtectionEnv.replay`).
 */
export interface RspackImportProtectionBuildInfo {
  version: 1
  env: string
  /** The violations of this module's output (with their edge modules). */
  violations: Array<EdgeViolation>
  /** The module's resolved edges (the trace steps through a restored module). */
  edges?: Array<IndexedEdge>
  /** The revision of the input the edges were judged in (their positions are located in the raw file at that revision). */
  revision?: string
}
