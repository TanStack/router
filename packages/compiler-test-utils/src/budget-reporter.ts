/**
 * A Vitest reporter that compares a compiler test run with its budget
 * (`test-budgets.json`), for local iteration at the budgets' worker count:
 *
 * - a whole tier (every file of the tier, no `-t` filter): its duration
 *   against the package's target and hard limit for the tier;
 * - each slow-tier file: its time against the per-file hard limit;
 * - a partial fast-tier run (the inner loop: a file or a `-t` filter): the
 *   time since the Vitest process started, a lower bound of edit to result
 *   (Nx adds its own startup), against the edit-to-result hard limit.
 *
 * The tier is the Vitest project: `integration` (and `integration-*`, e.g.
 * `integration-pages`) is the slow tier, the noncompiler project (outside
 * the compiler tests) has no budget, any other project is the fast tier. Runs at another worker count (CI, one worker) are
 * reported only.
 *
 * By default the reporter never fails a run: wall-clock times move with the
 * machine's load, and a test run must not fail because other runs share the
 * machine. With `COMPILER_TEST_BUDGETS=strict`, a run over a hard limit (or
 * not at the budgets' worker count) fails; strict mode is meant for a quiet
 * machine.
 *
 * A run in which a test file failed (a failed test, or a file that did not
 * load), an error escaped the tests, or the run was interrupted is not a
 * measurement: its times leave out or cut short the failed work. The report
 * says so, and strict mode fails it as an invalid measurement.
 *
 * With `COMPILER_TESTS_PINS=run`, it also lists the known-bug pins that
 * passed (`./pins`).
 */
import { readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { reportPins } from './pins'
import type {
  Reporter,
  SerializedError,
  TestModule,
  TestRunEndReason,
  Vitest,
} from 'vitest/node'

type Limits = [target: number, hard: number]
type Tier = 'unit' | 'integration'

interface Budgets {
  workers: number
  slowFileHard: number
  editToResultHard: number
  packages: Record<string, Record<Tier, Limits>>
}

const budgets: Budgets = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../test-budgets.json', import.meta.url)),
    'utf8',
  ),
)

/** The 1-minute load average under which strict mode is meant to run. */
const quietLoad = 4

function packageName(root: string) {
  return (
    JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as {
      name: string
    }
  ).name
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

const tierOf = (projectName: string): Tier | undefined =>
  projectName === 'integration' || projectName.startsWith('integration-')
    ? 'integration'
    : projectName === 'noncompiler'
      ? undefined
      : 'unit'

export default class BudgetReporter implements Reporter {
  private vitest!: Vitest
  private start = 0

  onInit(vitest: Vitest) {
    this.vitest = vitest
  }

  onTestRunStart() {
    this.start = performance.now()
  }

  async onTestRunEnd(
    allModules: ReadonlyArray<TestModule>,
    unhandledErrors: ReadonlyArray<SerializedError>,
    reason: TestRunEndReason,
  ) {
    reportPins(this.vitest, allModules)
    const testModules = allModules.filter(
      (m) => tierOf(m.project.name) !== undefined,
    )
    const seconds = (performance.now() - this.start) / 1000
    const name = packageName(this.vitest.config.root)
    const packageBudgets = budgets.packages[name]
    if (!packageBudgets || testModules.length === 0) {
      return
    }
    const strict = process.env.COMPILER_TEST_BUDGETS === 'strict'
    const workers = this.vitest.config.maxWorkers
    const atBudgetWorkers = workers === budgets.workers
    const lines: Array<string> = []
    const failures: Array<string> = []
    const check = (line: string, over: boolean) => {
      lines.push(line)
      if (over && atBudgetWorkers) {
        failures.push(line)
      }
    }

    const tiers = new Set(testModules.map((m) => tierOf(m.project.name)!))
    const at = `at ${workers} worker${workers === 1 ? '' : 's'}`
    if (tiers.size > 1) {
      lines.push(
        `${name}: ${seconds.toFixed(1)} s for both tiers ${at}; run one tier to compare it with its budget`,
      )
    } else {
      const tier = [...tiers][0]!
      const [target, hard] = packageBudgets[tier]
      const ran = new Set(testModules.map((m) => m.moduleId))
      const all = new Set<string>()
      for (const project of this.vitest.projects) {
        if (tierOf(project.name) === tier) {
          const files = await project.globTestFiles()
          for (const file of [
            ...files.testFiles,
            ...files.typecheckTestFiles,
          ]) {
            all.add(file)
          }
        }
      }
      const filtered = this.vitest.config.testNamePattern !== undefined
      const partial = filtered || ran.size < all.size
      const tierLine = `${name} ${tier}: ${seconds.toFixed(1)} s ${at}`
      if (partial) {
        lines.push(
          `${tierLine}, ${ran.size} of ${all.size} files${filtered ? ', -t filter' : ''}: a partial run, no tier budget`,
        )
      } else if (!atBudgetWorkers) {
        lines.push(
          `${tierLine}: reported only (the budgets are for --maxWorkers=${budgets.workers}: target ${target} s, hard limit ${hard} s)`,
        )
      } else {
        check(
          `${tierLine}: ${seconds > hard ? 'OVER the hard limit' : seconds > target ? 'over target, under the hard limit' : 'within target'} (target ${target} s, hard limit ${hard} s)`,
          seconds > hard,
        )
      }
      if (tier === 'unit' && partial) {
        // From the Vitest process's start: config, workers, imports, tests
        const sinceStart = process.uptime()
        check(
          `  edit to result, Vitest's part ${at}: ${sinceStart.toFixed(1)} s since the Vitest process started (hard limit ${budgets.editToResultHard} s with Nx's startup on top)`,
          sinceStart > budgets.editToResultHard,
        )
      }
    }

    let slowestFile: [string, number] | undefined
    for (const testModule of testModules) {
      if (tierOf(testModule.project.name) !== 'integration') {
        continue
      }
      const fileSeconds = moduleSeconds(testModule)
      const file = path.relative(this.vitest.config.root, testModule.moduleId)
      if (!slowestFile || fileSeconds > slowestFile[1]) {
        slowestFile = [file, fileSeconds]
      }
      if (fileSeconds > budgets.slowFileHard) {
        check(
          `  ${file}: ${fileSeconds.toFixed(1)} s ${at}, OVER the per-file hard limit (${budgets.slowFileHard} s)${atBudgetWorkers ? '' : ', reported only'}`,
          true,
        )
      }
    }
    if (slowestFile && slowestFile[1] <= budgets.slowFileHard) {
      lines.push(
        `  slowest file: ${slowestFile[0]} ${slowestFile[1].toFixed(1)} s (per-file hard limit ${budgets.slowFileHard} s)`,
      )
    }

    // Why the times above are not a measurement, if they are not
    const failedFiles = testModules
      .filter((m) => m.state() === 'failed')
      .map((m) => path.relative(this.vitest.config.root, m.moduleId))
    const invalidBecause = [
      ...(failedFiles.length > 0
        ? [`test files failed: ${failedFiles.join(', ')}`]
        : []),
      ...(unhandledErrors.length > 0
        ? [`${unhandledErrors.length} error(s) outside the tests`]
        : []),
      ...(reason === 'interrupted' ? ['the run was interrupted'] : []),
    ].join('; ')

    if (!strict) {
      this.vitest.logger.log(
        `\nTest budget (report only; COMPILER_TEST_BUDGETS=strict fails over a hard limit)\n${lines.join('\n')}${invalidBecause ? `\n  not a measurement (${invalidBecause}): the times leave out or cut short the failed work` : ''}`,
      )
      return
    }
    const [load] = os.loadavg()
    if (!atBudgetWorkers) {
      failures.push(
        `strict mode measures at --maxWorkers=${budgets.workers}, this run used ${workers}`,
      )
    }
    this.vitest.logger.log(
      `\nTest budget (strict; meant for a quiet machine: 1-minute load below ${quietLoad} and no other test runs; the load now is ${load!.toFixed(1)}${load! >= quietLoad ? ', so a failure may be the load' : ''})\n${lines.join('\n')}`,
    )
    if (invalidBecause) {
      this.vitest.logger.error(
        `\nTest budget (strict): not a valid measurement (${invalidBecause}); fix the run and measure again`,
      )
      process.exitCode = 1
    } else if (failures.length > 0) {
      this.vitest.logger.error(
        `\nTest budget exceeded (strict):\n${failures.map((line) => `  ${line.trim()}`).join('\n')}`,
      )
      process.exitCode = 1
    } else {
      this.vitest.logger.log('Test budget (strict): passed')
    }
  }
}
