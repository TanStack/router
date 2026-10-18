/**
 * A Vitest reporter that compares the duration of a compiler test tier with
 * its budget (`test-budgets.json`): the run's duration against the tier's
 * target and hard limit, and, at one worker, each slow-tier file against the
 * per-file hard limit. Report-only: it prints the comparison and never fails
 * the run.
 *
 * The tier is the Vitest project: `integration` is the slow tier, any other
 * project the fast tier. The machine is `ci` at one worker, `dev` otherwise.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Reporter, TestModule, Vitest } from 'vitest/node'

type Limits = [target: number, hard: number]

interface Budgets {
  slowFileHardCi: number
  packages: Record<
    string,
    Record<'unit' | 'integration', { dev?: Limits; ci?: Limits }>
  >
}

const budgets: Budgets = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../test-budgets.json', import.meta.url)),
    'utf8',
  ),
)

function packageName(root: string) {
  return (
    JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as {
      name: string
    }
  ).name
}

function verdict(seconds: number, [target, hard]: Limits) {
  if (seconds > hard) {
    return `over the hard limit (${hard} s)`
  }
  if (seconds > target) {
    return `over target (${target} s), under the hard limit (${hard} s)`
  }
  return `within target (${target} s)`
}

/** The time a test module took: environment, setup, import and its tests. */
function moduleSeconds(testModule: TestModule) {
  const d = testModule.diagnostic()
  return (
    (d.environmentSetupDuration +
      d.prepareDuration +
      d.collectDuration +
      d.setupDuration +
      d.duration) /
    1000
  )
}

export default class BudgetReporter implements Reporter {
  private vitest!: Vitest
  private start = 0

  onInit(vitest: Vitest) {
    this.vitest = vitest
  }

  onTestRunStart() {
    this.start = performance.now()
  }

  onTestRunEnd(testModules: ReadonlyArray<TestModule>) {
    const seconds = (performance.now() - this.start) / 1000
    const name = packageName(this.vitest.config.root)
    const packageBudgets = budgets.packages[name]
    if (!packageBudgets || testModules.length === 0) {
      return
    }
    const tiers = new Set(
      testModules.map((m) =>
        m.project.name === 'integration' ? 'integration' : 'unit',
      ),
    )
    const machine = this.vitest.config.maxWorkers <= 1 ? 'ci' : 'dev'
    const lines: Array<string> = []
    if (tiers.size === 1) {
      const tier = [...tiers][0] as 'unit' | 'integration'
      const limits = packageBudgets[tier][machine]
      lines.push(
        limits
          ? `${name} ${tier}: ${seconds.toFixed(1)} s at ${this.vitest.config.maxWorkers} worker(s), ${verdict(seconds, limits)} [${machine}]`
          : `${name} ${tier}: ${seconds.toFixed(1)} s at ${this.vitest.config.maxWorkers} worker(s), no ${machine} budget`,
      )
    } else {
      lines.push(
        `${name}: ${seconds.toFixed(1)} s for both tiers; run one tier to compare it with its budget`,
      )
    }
    if (machine === 'ci') {
      for (const testModule of testModules) {
        const fileSeconds = moduleSeconds(testModule)
        if (
          testModule.project.name === 'integration' &&
          fileSeconds > budgets.slowFileHardCi
        ) {
          lines.push(
            `  ${path.relative(this.vitest.config.root, testModule.moduleId)}: ${fileSeconds.toFixed(1)} s, over the per-file hard limit (${budgets.slowFileHardCi} s)`,
          )
        }
      }
    }
    this.vitest.logger.log(`\nTest budget (report only)\n${lines.join('\n')}`)
  }
}
