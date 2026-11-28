// Attributes a V8 .cpuprofile (from `node --cpu-prof`) to code owners.
//
// - byCategory: self time per owner (TanStack compiler packages, Babel, Vite,
//   Rolldown JS glue, ...). Native frames without a URL inherit the category of
//   their nearest JS ancestor, so native parsers called from JS stay with
//   their caller.
// - compilerInclusiveMs: samples whose stack contains a TanStack compiler
//   frame (includes Babel/Prettier/fs work the compiler calls synchronously).
//
// The compiler package list can be extended with COMPILER_PERF_COMPILER_RE (a
// regular expression matched against frame URLs), e.g. for new packages that
// a rewrite introduces.

import fs from 'node:fs'

const DEFAULT_COMPILER_RE =
  /\/(?:packages|node_modules\/@tanstack)\/(?:router-plugin|router-generator|router-utils|start-plugin-core|react-start-rsc|solid-start-rsc|virtual-file-routes|[a-z-]*compiler[a-z-]*)\/(?!node_modules)|\/(?:packages|node_modules\/@tanstack)\/(?:react|solid|vue)-start\/dist\/esm\/plugin\/|\/node_modules\/(?:@yuku|yuku)[^/]*\//

function compilerRe() {
  const extra = process.env.COMPILER_PERF_COMPILER_RE
  return extra
    ? new RegExp(`${DEFAULT_COMPILER_RE.source}|${extra}`)
    : DEFAULT_COMPILER_RE
}

const CATEGORY_RULES = [
  [
    'babel',
    /\/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?(?:@babel\/|babel-dead-code-elimination\/|recast\/|ast-types\/)/,
  ],
  ['prettier', /\/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?prettier\//],
  ['vite', /\/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?vite\//],
  [
    'rolldown',
    /\/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?(?:rolldown|@rolldown\/)/,
  ],
  [
    'rsbuild/rspack',
    /\/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?(?:@rsbuild\/|@rspack\/)/,
  ],
  [
    'plugin-react',
    /\/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?@vitejs\//,
  ],
  [
    'plugin-solid',
    /\/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?(?:vite-plugin-solid|babel-preset-solid|babel-plugin-jsx-dom-expressions|solid-refresh|@rsbuild\/plugin-solid)\//,
  ],
  [
    'react-runtime',
    /\/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?(?:react|react-dom|scheduler)\//,
  ],
  [
    'tanstack-runtime',
    /\/packages\/[^/]+\/(?:dist|src)\/|\/node_modules\/@tanstack\//,
  ],
  ['app', /\/benchmarks\/compiler-perf\/apps\//],
  ['other-deps', /\/node_modules\//],
  ['node', /^node:|^internal\/|^(?![a-z]+:)[^/]/],
]

export function analyzeCpuProfile(file) {
  const profile = JSON.parse(fs.readFileSync(file, 'utf8'))
  const re = compilerRe()
  const nodes = new Map()
  const parent = new Map()
  for (const node of profile.nodes) {
    nodes.set(node.id, node)
    for (const child of node.children ?? []) {
      parent.set(child, node.id)
    }
  }
  const categoryOf = new Map()
  const inCompiler = new Map()
  const resolve = (id) => {
    if (categoryOf.has(id)) {
      return
    }
    const node = nodes.get(id)
    const { url, functionName } = node.callFrame
    const parentId = parent.get(id)
    if (parentId !== undefined) {
      resolve(parentId)
    }
    let category
    if (functionName === '(garbage collector)') {
      category = '(gc)'
    } else if (functionName === '(idle)') {
      category = '(idle)'
    } else if (functionName === '(program)') {
      category = '(program)'
    } else if (functionName === '(root)') {
      category = '(root)'
    } else if (!url) {
      category = parentId !== undefined ? categoryOf.get(parentId) : 'native'
      if (category === '(root)') {
        category = 'native'
      }
    } else if (re.test(url)) {
      category = 'tanstack-compiler'
    } else {
      category =
        CATEGORY_RULES.find(([, rule]) => rule.test(url))?.[0] ?? 'other'
    }
    categoryOf.set(id, category)
    inCompiler.set(
      id,
      category === 'tanstack-compiler' ||
        (parentId !== undefined && inCompiler.get(parentId)),
    )
  }

  const byCategory = {}
  let compilerInclusiveUs = 0
  let totalUs = 0
  const { samples, timeDeltas } = profile
  for (let i = 0; i < samples.length; i++) {
    // timeDeltas[i] is the time elapsed before sample i; attribute the next
    // delta to the sampled frame.
    const dt = timeDeltas[i + 1] ?? 0
    const id = samples[i]
    resolve(id)
    const category = categoryOf.get(id)
    byCategory[category] = (byCategory[category] ?? 0) + dt
    if (inCompiler.get(id)) {
      compilerInclusiveUs += dt
    }
    totalUs += dt
  }
  const busyUs = totalUs - (byCategory['(idle)'] ?? 0)
  const ms = (us) => Math.round(us / 100) / 10
  return {
    profileMs: ms(profile.endTime - profile.startTime),
    busyMs: ms(busyUs),
    compilerInclusiveMs: ms(compilerInclusiveUs),
    compilerShareOfBusy: busyUs
      ? Math.round((compilerInclusiveUs / busyUs) * 1000) / 1000
      : 0,
    byCategory: Object.fromEntries(
      Object.entries(byCategory)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => [k, ms(v)]),
    ),
  }
}

/** Merges the analyses of several profiles written by one process tree. */
export function analyzeCpuProfileDir(dir) {
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith('.cpuprofile'))
    : []
  const analyses = files.map((f) => ({
    file: f,
    ...analyzeCpuProfile(`${dir}/${f}`),
  }))
  // Report the busiest profile (the main thread of the process under test)
  // and keep the others for reference.
  analyses.sort((a, b) => b.busyMs - a.busyMs)
  return {
    main: analyses[0],
    others: analyses.slice(1).map(({ file, busyMs, compilerInclusiveMs }) => ({
      file,
      busyMs,
      compilerInclusiveMs,
    })),
  }
}

if (
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].split('/').pop())
) {
  for (const file of process.argv.slice(2)) {
    console.log(file, JSON.stringify(analyzeCpuProfile(file), null, 2))
  }
}
