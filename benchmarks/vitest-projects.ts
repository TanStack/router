/**
 * Narrows a per-framework aggregate Vitest config to the projects listed in
 * `BENCHMARK_VITEST_PROJECTS`: comma-separated project directories relative to
 * the aggregate config, e.g. `solid,scenarios/loaders/solid`.
 *
 * The CodSpeed workflow sets it on pull requests to run only the scenarios
 * affected by the change (`scripts/benchmarks/codspeed/plan.mjs`). Unlike a
 * `--project` name filter, unselected projects' Vite configs are not loaded,
 * so their dependencies do not have to be built. When the variable is unset
 * or empty the project globs are returned unchanged.
 */
export function selectBenchmarkProjects(projects: Array<string>) {
  const selection = process.env.BENCHMARK_VITEST_PROJECTS
  if (!selection) {
    return projects
  }

  const patterns = projects.map(
    (project) =>
      new RegExp(
        `^${project
          .split('*')
          .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('[^/]+')}$`,
      ),
  )

  return selection.split(',').map((directory) => {
    const config = `./${directory}/vite.config.ts`
    if (!patterns.some((pattern) => pattern.test(config))) {
      throw new Error(
        `BENCHMARK_VITEST_PROJECTS entry "${directory}" does not match any of ${projects.join(', ')}`,
      )
    }
    return config
  })
}
