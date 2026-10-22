/**
 * The generator entries of webpack and Rspack in the compiler's own watch
 * mode (`compiler.watch`, as webpack-dev-server and `--watch` use it): a
 * route file created while the compiler watches is scaffolded and joins the
 * route tree the bundle runs (the real router, in Node), every compile
 * succeeds, and closing the watch session stops the generator's watching
 * (SPEC J1.10): a route file created afterwards is left as it is. Waits are
 * on the compiler's own build events; nothing reacting after the close is
 * observed for a bounded time.
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
