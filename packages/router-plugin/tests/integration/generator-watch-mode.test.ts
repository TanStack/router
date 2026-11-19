/**
 * The generator entries of webpack and Rspack in the compiler's own watch
 * mode (`compiler.watch`, as webpack-dev-server and `--watch` use it): a
 * route file created while the compiler watches is scaffolded and joins the
 * route tree the bundle runs (the real router, in Node), every compile
 * succeeds, and closing the watch session stops the generator's watching
 * (SPEC J1.10): a route file created afterwards is left as it is; a
 * watching opened again on the same compiler applies route config edits to
 * modules it already holds. Waits are on the compiler's own build events;
 * nothing reacting after the close is observed for a bounded time.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { expect, test } from 'vitest'
import { createFileRouteCall } from '../generator-dev-app'
import { startWatchSession, until } from '../generator-watch-session'

/**
 * How long nothing may react to a route file created after the close: a
 * watching generator scaffolds one within a build (`aggregateTimeout` 50 ms)
 * in these apps.
 */
const quietFor = 1500

test.each(['webpack', 'rspack'] as const)(
  '%s: a created route file is scaffolded and joins the route tree the bundle runs, every compile succeeds, and closing the watch session stops the watching',
  async (bundler) => {
    const session = await startWatchSession(bundler)
    const { builds, file, run, waitForBuild } = session

    await writeFile(file('routes/posts.js'), '')
    let ran: Awaited<ReturnType<typeof run>> | undefined
    await until(
      async () => {
        if (!builds.length || builds.at(-1)!.error) {
          return false
        }
        try {
          ran = await run('/posts')
        } catch {
          return false
        }
        return ran.routes.includes('/posts < __root__')
      },
      () =>
        `no build ran /posts (builds: ${JSON.stringify(builds)}, last run: ${JSON.stringify(ran)})`,
      waitForBuild,
    )
    expect(ran!.routes).toEqual(['/posts < __root__', '__root__ < '])
    expect(ran!.html).toContain('MARK_SCAFFOLD')
    expect(
      createFileRouteCall(await readFile(file('routes/posts.js'), 'utf8')).path,
    ).toBe('/posts')
    expect(
      builds.filter((build) => build.error || build.errors.length),
    ).toEqual([])

    // Closing the watch session stops the generator: a route file created
    // afterwards is neither scaffolded nor added to the route tree.
    const tree = await readFile(file('routeTree.gen.js'), 'utf8')
    await session.close()
    await writeFile(file('routes/later.js'), '')
    await new Promise((resolve) => setTimeout(resolve, quietFor))
    expect(
      await readFile(file('routes/later.js'), 'utf8'),
      'a route file created after the watch session closed',
    ).toBe('')
    expect(
      await readFile(file('routeTree.gen.js'), 'utf8'),
      'the route tree after the watch session closed',
    ).toBe(tree)
  },
  60_000,
)

/** A virtual route config with `page.js` at `pagePath`, evaluated slowly. */
const slowRouteConfig = (pagePath: string) =>
  `// (a config slower to evaluate than the bundler's batch: the generator
// writes during the compilation the bundler's own event started)
await new Promise((resolve) => setTimeout(resolve, 300))
export const routes = {
  type: 'root',
  file: '__root.js',
  children: [{ type: 'route', path: '${pagePath}', file: 'page.js' }],
}
`

// The generator rewrites a route file whose path the virtual route config
// changes; when the bundler's own watcher reports the config's edit (the app
// imports it), the generator writes the route file and the route tree during
// that compilation, which builds both from what it wrote. Source: review of
// the route deletion fix (a tree-only fix ships the new route with the old
// route file).
test.each(['webpack', 'rspack'] as const)(
  '%s: every build serving a route the virtual route config moved serves its rewritten route file',
  async (bundler) => {
    const session = await startWatchSession(bundler, {
      files: {
        'routes.ts': slowRouteConfig('/first'),
        'routes/page.js': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/first')({ component: () => 'MARK_PAGE' })
`,
        'main.js': `export { routeTree } from './routeTree.gen.js'
export { default as pageSource } from './routes/page.js?source'
export { default as routeConfigSource } from './routes.ts?source'
`,
      },
      pluginOptions: (file) => ({ virtualRouteConfig: file('routes.ts') }),
    })
    const { builds, file, routesOf, waitForBuild } = session
    expect(routesOf(builds.at(-1)!)).toContain('/first < __root__')

    const edited = builds.length
    await writeFile(file('routes.ts'), slowRouteConfig('/second'))
    await until(
      () =>
        builds.length > edited &&
        !!builds.at(-1)!.exports &&
        routesOf(builds.at(-1)!).includes('/second < __root__'),
      () => `no build served /second (builds: ${JSON.stringify(builds)})`,
      waitForBuild,
    )
    expect(
      createFileRouteCall(await readFile(file('routes/page.js'), 'utf8')).path,
    ).toBe('/second')
    const since = builds.slice(edited)
    expect(since.filter((build) => build.error || build.errors.length)).toEqual(
      [],
    )
    // (no build served the new route with the route file's old text)
    expect(
      since
        .filter((build) => routesOf(build).includes('/second < __root__'))
        .map((build) => createFileRouteCall(build.exports!.pageSource).path)
        .filter((path) => path !== '/second'),
    ).toEqual([])
  },
  60_000,
)

/** A virtual route config with `contact.js` at `/contact`, or the root alone. */
const contactRouteConfig = (withContact: boolean) =>
  `export const routes = {
  type: 'root',
  file: '__root.js',
  children: [${withContact ? `{ type: 'route', path: '/contact', file: 'contact.js' }` : ''}],
}
`

// A watching closed and another opened on the same compiler (a tool that
// pauses and resumes a compiler): a module the bundle already holds becomes
// a route through the virtual route config alone (its source unchanged),
// edited while no watching ran, and the reopened watching's first build
// splits it as configured (`deleteNodes`), as a fresh process does; the
// route config's next edit, while it watches, makes it a plain module
// again. Source: Astra review round 4 (B3: webpack regenerated the route
// tree but kept the module built before, loader and all; main misses the
// route config's edit on both bundlers).
test.each(['webpack', 'rspack'] as const)(
  '%s: after a watching closed, route config edits reach a module the next watching already holds',
  async (bundler) => {
    const session = await startWatchSession(bundler, {
      plugin: 'router',
      files: {
        'routes.ts': contactRouteConfig(false),
        'routes/contact.js': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/contact')({
  loader: () => 'MARK_LOADER',
  component: () => 'MARK_CONTACT',
})
`,
        'main.js': `export { routeTree } from './routeTree.gen.js'
export { Route as contact } from './routes/contact.js'
`,
      },
      pluginOptions: (file) => ({
        virtualRouteConfig: file('routes.ts'),
        autoCodeSplitting: true,
        codeSplittingOptions: { deleteNodes: ['loader'] },
      }),
    })
    const { builds, file, routesOf, waitForBuild } = session
    const last = () => builds.at(-1)!
    /** Waits for a build whose route tree has `/contact` as `routed` says, and whose contact module has its loader unless it is a route. */
    const served = (from: number, routed: boolean) =>
      until(
        () =>
          builds.length > from &&
          !!last().exports &&
          routesOf(last()).includes('/contact < __root__') === routed &&
          typeof last().exports!.contact.options.loader ===
            (routed ? 'undefined' : 'function'),
        () =>
          `no build served /contact ${routed ? 'as a route without' : 'as a plain module with'} its loader (last: ${JSON.stringify(
            {
              error: last().error,
              errors: last().errors,
              routes: last().exports && routesOf(last()),
              loader: typeof last().exports?.contact.options.loader,
            },
          )})`,
        waitForBuild,
      )
    expect(typeof last().exports!.contact.options.loader).toBe('function')

    const reopened = builds.length
    await session.reopen(() =>
      writeFile(file('routes.ts'), contactRouteConfig(true)),
    )
    await served(reopened, true)
    const edited = builds.length
    await writeFile(file('routes.ts'), contactRouteConfig(false))
    await served(edited, false)
    expect(
      builds
        .slice(reopened)
        .filter((build) => build.error || build.errors.length),
    ).toEqual([])
  },
  60_000,
)
