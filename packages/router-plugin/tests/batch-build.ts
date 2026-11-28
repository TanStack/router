/**
 * One production build of several one-route apps (a group of cases of a
 * test file) whose rows only run their case: case `i`'s route at
 * `routes/c<i>.tsx` (its `createFileRoute('/')` becomes `/c<i>`), its other
 * files under `c<i>/`, its entry at `c<i>/entry.ts`, which the app's entry
 * imports on demand (`export const c<i> = () => import('./c<i>/entry')`).
 * A run loads its case's entry only, in a process or page of its own (as
 * `BuildResult.run`): a case that throws when its modules load fails its
 * own row.
 *
 * When the shared build fails, every case is built alone (once, for the
 * group): each row runs on its own build and fails with its own error,
 * whatever the bundler's message names. A shared build that fails while
 * every case builds alone fails every row with the shared build's error.
 *
 * Only for rows that run their case: what ships where (placement, what a
 * client bundle holds at all) is the whole output's, and needs a build of
 * its own per case.
 *
 * Cases are written as one-route apps (`routeApp`): imports of `../<file>`
 * in the route (`require('../…')` too) and of `./routes/index` in the entry
 * and the other files are rewritten to the case's own paths.
 */
import { afterAll } from 'vitest'
import { buildShared, rootRoute } from './build-harness'
import type { BuildResult } from '@tanstack/compiler-test-utils/build-harness'

export interface BatchCase {
  /** The case's name (its row's title), in errors. */
  name: string
  /** `routes/index.tsx` of the one-route app (one `createFileRoute('/')`). */
  route: string
  /** `entry.ts` of the one-route app. */
  entry: string
  /** The app's other files, by path relative to its root. */
  files?: Record<string, string>
}

export interface CaseApp {
  /** `BuildResult.run` on the case's entry (`entry` in `script`). */
  run: BuildResult['run']
}

type BuildOptions = Omit<Parameters<typeof buildShared>[0], 'files'> & {
  /** The root route (default React's). */
  root?: string
}

function caseFiles(c: BatchCase, i: number): Record<string, string> {
  const id = `c${i}`
  if (c.route.split("createFileRoute('/')").length !== 2) {
    throw new Error(`batch case "${c.name}": one createFileRoute('/') expected`)
  }
  const toRoute = (text: string) =>
    text.replaceAll(/(['"])\.\/routes\/index\1/g, `$1../routes/${id}$1`)
  const files: Record<string, string> = {
    [`routes/${id}.tsx`]: c.route
      .replace("createFileRoute('/')", `createFileRoute('/${id}')`)
      .replaceAll(
        /(from\s+|import\(\s*|require\(\s*)(['"])\.\.\//g,
        `$1$2../${id}/`,
      ),
    [`${id}/entry.ts`]: toRoute(c.entry),
  }
  for (const [name, text] of Object.entries(c.files ?? {})) {
    files[`${id}/${name}`] = toRoute(text)
  }
  return files
}

/** One build of `cases`. */
function buildCases(
  options: BuildOptions,
  cases: ReadonlyArray<BatchCase>,
): Promise<BuildResult> {
  const { root = rootRoute, ...rest } = options
  const files: Record<string, string> = { 'routes/__root.tsx': root }
  cases.forEach((c, i) => Object.assign(files, caseFiles(c, i)))
  files['entry.ts'] = cases
    .map((_, i) => `export const c${i} = () => import('./c${i}/entry')\n`)
    .join('')
  return buildShared({ ...rest, files })
}

/** `script` on case `i`'s entry of `app`. */
const runCase =
  (app: BuildResult, i: number): BuildResult['run'] =>
  (script = '') =>
    app.run(
      `const caseEntry = await entry.c${i}()\nreturn await (async (entry) => { ${script} })(caseEntry)`,
    )

type Group =
  | { shared: BuildResult }
  | { error: unknown; alone: Array<Promise<BuildResult>> }

/**
 * A group of cases registered while the test file is collected: `add(c)`
 * at describe level returns the row's `CaseApp` getter; the group's build
 * starts at the first row's call, and its apps are disposed of when the file
 * ends.
 */
export function batchCases(
  options: BuildOptions,
): (c: BatchCase) => () => Promise<CaseApp> {
  const cases: Array<BatchCase> = []
  let group: Promise<Group> | undefined
  afterAll(async () => {
    const built = await group
    const apps = built && ('shared' in built ? [built.shared] : built.alone)
    for (const app of apps ?? []) {
      await (await Promise.resolve(app).catch(() => undefined))?.dispose()
    }
  })
  const built = () =>
    (group ??= buildCases(options, cases).then(
      (shared): Group => ({ shared }),
      async (error: unknown): Promise<Group> => {
        // Each case alone, one at a time: each row gets its own outcome
        const alone: Array<Promise<BuildResult>> = []
        for (const c of cases) {
          const app = buildCases(options, [c])
          await app.catch(() => undefined)
          alone.push(app)
        }
        return { error, alone }
      },
    ))
  return (c) => {
    if (group) {
      throw new Error(`batch case "${c.name}" added after its group built`)
    }
    const i = cases.push(c) - 1
    return async () => {
      const result = await built()
      if ('shared' in result) {
        return { run: runCase(result.shared, i) }
      }
      const outcomes = await Promise.allSettled(result.alone)
      if (outcomes.every((outcome) => outcome.status === 'fulfilled')) {
        throw new Error(
          `the shared ${options.bundler} build of ${cases.length} cases failed, and every case builds alone`,
          { cause: result.error },
        )
      }
      // (this case's own build: its own error, or its run)
      return { run: runCase(await result.alone[i]!, 0) }
    }
  }
}
