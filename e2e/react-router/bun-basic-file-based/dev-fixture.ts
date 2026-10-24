import { spawn, execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

export function aboutSource(
  component = 'ABOUT_BEFORE',
  loader = 'LOADER_BEFORE',
  map = 'AUTHORED_BEFORE',
) {
  return `import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
const state = globalThis as typeof globalThis & { __bunDevSharedInitializations?: number }
const shared = { initialization: (state.__bunDevSharedInitializations = (state.__bunDevSharedInitializations ?? 0) + 1) }
export const Route = createFileRoute('/about')({
  loader: () => ({ shared, label: '${loader}' }),
  component: About,
})
function About() {
  const [count, setCount] = useState(0)
  const data = Route.useLoaderData()
  function authoredProbe() {
    throw new Error('${map}')
  }
  return <section>
    <h1 data-shared-identity={String(data.shared === shared)}>${component}</h1>
    <button onClick={() => setCount(value => value + 1)}>Count {count}</button>
    <output data-testid="loader">{data.label}</output>
    <button onClick={authoredProbe}>Authored error</button>
  </section>
}
`
}

export const nestedSource = (id: string, marker: string) =>
  `import { createFileRoute } from '@tanstack/react-router'; export const Route = createFileRoute('${id}')({ component: () => <h1>${marker}</h1> });\n`

export const virtualConfigSource = (included: 'before' | 'after') =>
  `import { rootRoute, index, route } from '@tanstack/virtual-file-routes'; export const routes = rootRoute('__root.tsx', [index('index.tsx'), route('/about', 'about.tsx'), route('/virtual-${included}', '../virtual-pages/${included}.tsx')]);\n`

export type InlineMapEvent = { id: string; contents: string }

export async function startDevFixture({
  generatedExtension = 'ts',
  virtualMount = false,
  virtualConfigFile = false,
  virtualConfigHelperDepth = 0,
  autoCodeSplitting = true,
  projectAlias = false,
}: {
  generatedExtension?: string
  virtualMount?: boolean
  virtualConfigFile?: boolean
  virtualConfigHelperDepth?: 0 | 1 | 2
  autoCodeSplitting?: boolean
  projectAlias?: boolean
} = {}) {
  const executable = process.env.BUN_EXECUTABLE
  const repo = process.env.ROUTER_REPOSITORY_ROOT
  if (!executable || !repo) {
    throw new Error('Use run-dev.mjs with BUN_EXECUTABLE set')
  }
  const requirePlugin = createRequire(
    path.join(repo, 'packages/router-plugin/package.json'),
  )
  const requireReact = createRequire(
    path.join(repo, 'packages/react-router/package.json'),
  )
  const requireProject = createRequire(
    fileURLToPath(new URL('./package.json', import.meta.url)),
  )
  const container = await mkdtemp(path.join(tmpdir(), 'router-bun-native-dev-'))
  const directory = projectAlias ? path.join(container, 'alias') : container
  const inlineMaps: Array<InlineMapEvent> = []
  let logs = ''
  let child: ReturnType<typeof spawn> | undefined
  const file = (name: string) => path.join(directory, name)
  const save = async (name: string, source: string) => {
    await mkdir(path.dirname(file(name)), { recursive: true })
    await writeFile(file(name), source)
  }
  try {
    if (projectAlias) {
      const source = path.join(container, 'source')
      await mkdir(source)
      await symlink(
        source,
        directory,
        process.platform === 'win32' ? 'junction' : 'dir',
      )
    }
    for (const name of [
      '@tanstack/router-plugin',
      '@tanstack/react-router',
      '@tanstack/virtual-file-routes',
      'react',
      'react-dom',
    ]) {
      const target = name.startsWith('@tanstack/')
        ? path.join(repo, 'packages', name.slice('@tanstack/'.length))
        : path.dirname(requireReact.resolve(`${name}/package.json`))
      const destination = file(`node_modules/${name}`)
      await mkdir(path.dirname(destination), { recursive: true })
      await symlink(
        target,
        destination,
        process.platform === 'win32' ? 'junction' : 'dir',
      )
    }
    await mkdir(file('routes/nested/empty/deep'), { recursive: true })
    await mkdir(file('routes/(conflict)'), { recursive: true })
    await mkdir(file('mounted/empty/deep'), { recursive: true })
    await save(
      'routes/__root.tsx',
      `import { createRootRoute, Link, Outlet } from '@tanstack/react-router'; export const Route = createRootRoute({ notFoundComponent: () => <h1>NOT_FOUND</h1>, component: () => <><nav><Link to="/">Home</Link><Link to="/about">About</Link><Link to="/nested/empty/deep/added">Nested added</Link><Link to="/nested/empty/deep/renamed">Nested renamed</Link><Link to="/empty/deep/created">Mounted created</Link><Link to="/repaired">Repaired</Link><Link to="/virtual-before">Virtual before</Link><Link to="/virtual-after">Virtual after</Link></nav><Outlet /></> });`,
    )
    await save('routes/index.tsx', nestedSource('/', 'HOME_NATIVE_DEV'))
    await save('routes/about.tsx', aboutSource())
    if (virtualConfigFile) {
      for (let index = 0; index < virtualConfigHelperDepth; index++) {
        await save(
          index ? `config/helper${index}.ts` : 'virtual-routes.ts',
          `export { routes } from '${index ? './' : './config/'}helper${index + 1}.ts'\n`,
        )
      }
      await save(
        virtualConfigHelperDepth
          ? `config/helper${virtualConfigHelperDepth}.ts`
          : 'virtual-routes.ts',
        virtualConfigSource('before'),
      )
      await save(
        'virtual-pages/before.tsx',
        nestedSource('/virtual-before', 'VIRTUAL_BEFORE'),
      )
      await save(
        'virtual-pages/after.tsx',
        nestedSource('/virtual-after', 'VIRTUAL_AFTER'),
      )
    }
    await save(
      'main.tsx',
      `import { createRoot } from 'react-dom/client'; import { createRouter, RouterProvider } from '@tanstack/react-router'; import { routeTree } from './routeTree.gen.${generatedExtension}'; const router = createRouter({ routeTree, defaultPreload: false }); createRoot(document.getElementById('app')!).render(<RouterProvider router={router} />);`,
    )
    await save(
      'index.html',
      '<!doctype html><div id="app"></div><script type="module" src="./main.tsx"></script>',
    )
    await save(
      'tsconfig.json',
      JSON.stringify({ compilerOptions: { jsx: 'react-jsx' } }),
    )
    await save(
      'bunfig.toml',
      '[serve.static]\nplugins = ["./plugin.ts"]\nsourcemap = "linked"\n',
    )
    const options = {
      target: 'react',
      routesDirectory: file('routes'),
      generatedRouteTree: file(`routeTree.gen.${generatedExtension}`),
      tmpDir: file('tmp'),
      autoCodeSplitting,
      disableLogging: true,
      codeSplittingOptions: { defaultBehavior: [['loader'], ['component']] },
    }
    await save(
      'plugin.ts',
      `${virtualMount ? `import { rootRoute, index, route, physical } from '@tanstack/virtual-file-routes';` : ''}
const { default: router } = await import('@tanstack/router-plugin/bun');
const options = ${JSON.stringify(options)};
${virtualMount ? `options.virtualRouteConfig = rootRoute('__root.tsx', [index('index.tsx'), route('/about', 'about.tsx'), physical('../mounted')]);` : ''}
${virtualConfigFile ? `options.virtualRouteConfig = 'virtual-routes.ts';` : ''}
const plugin = router(options);
export default { name: 'observe-public-router-dev', setup(build) {
  return plugin.setup(new Proxy(build, { get(target, key) {
    if (key === 'onLoad') return (options, callback) => target.onLoad(options, async args => {
      const result = await callback(args);
      if (typeof result?.contents === 'string' && args.path.replaceAll('\\\\', '/').includes('/routes/')) {
        console.log('ROUTER_INLINE_MAP ' + JSON.stringify({ id: args.path, contents: result.contents }));
      }
      return result;
    });
    const value = Reflect.get(target, key);
    return typeof value === 'function' ? value.bind(target) : value;
  } }));
} };
`,
    )
    await save(
      'server.ts',
      `import html from './index.html'; const server = Bun.serve({ hostname: '127.0.0.1', port: 0, development: { hmr: true }, routes: { '/__native-info': () => Response.json({ pid: process.pid }), '/*': html } }); console.log('ROUTER_READY ' + JSON.stringify({ url: server.url.href, pid: process.pid }));`,
    )
    const preload = process.env.BUN_PLUGIN_PRELOAD
    const preloadArg = preload
      ? preload.startsWith('file:')
        ? fileURLToPath(preload)
        : path.resolve(preload)
      : undefined
    let pending = ''
    let settleReady: (value: { url: string; pid: number }) => void
    let rejectReady: (error: Error) => void
    const ready = new Promise<{ url: string; pid: number }>(
      (resolve, reject) => {
        settleReady = resolve
        rejectReady = reject
      },
    )
    child = spawn(
      executable,
      [...(preloadArg ? ['--preload', preloadArg] : []), 'server.ts'],
      {
        cwd: directory,
        env: { ...process.env, NODE_ENV: 'development' },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      },
    )
    child.on('error', (error) => rejectReady(error))
    child.on('exit', (code, signal) =>
      rejectReady(
        new Error(`Bun exited before readiness (${code}, ${signal})\n${logs}`),
      ),
    )
    child.stdout!.on('data', (chunk) => {
      logs = (logs + chunk).slice(-2_000_000)
      pending += chunk.toString()
      let newline: number
      while ((newline = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0, newline)
        pending = pending.slice(newline + 1)
        try {
          if (line.startsWith('ROUTER_READY ')) {
            settleReady(JSON.parse(line.slice('ROUTER_READY '.length)))
          }
          if (line.startsWith('ROUTER_INLINE_MAP ')) {
            inlineMaps.push(JSON.parse(line.slice('ROUTER_INLINE_MAP '.length)))
          }
        } catch (error) {
          rejectReady(new Error(`Invalid fixture event: ${error}`))
        }
      }
    })
    child.stderr!.on('data', (chunk) => {
      logs = (logs + chunk).slice(-2_000_000)
    })
    let timeout: ReturnType<typeof setTimeout>
    const info = await Promise.race([
      ready,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`Bun readiness deadline\n${logs}`)),
          20_000,
        )
      }),
    ]).finally(() => clearTimeout(timeout!))
    const versionOf = async (
      name: string,
      requireFrom: ReturnType<typeof createRequire>,
    ) =>
      JSON.parse(
        await readFile(requireFrom.resolve(`${name}/package.json`), 'utf8'),
      ).version as string
    const versions = {
      bun: execFileSync(executable, ['--version'], { encoding: 'utf8' }).trim(),
      revision: execFileSync(executable, ['--revision'], {
        encoding: 'utf8',
      }).trim(),
      node: process.version,
      routerPlugin: await versionOf('@tanstack/router-plugin', requirePlugin),
      reactRouter: await versionOf('@tanstack/react-router', requireReact),
      react: await versionOf('react', requireReact),
      unplugin: await versionOf('unplugin', requirePlugin),
      playwright: await versionOf('@playwright/test', requireProject),
      preload: preloadArg ?? null,
      preloadSha256: preloadArg
        ? createHash('sha256')
            .update(await readFile(preloadArg))
            .digest('hex')
        : null,
      routerHead: execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: repo,
        encoding: 'utf8',
      }).trim(),
    }
    return {
      ...info,
      directory,
      versions,
      inlineMaps,
      virtualConfigPath: virtualConfigHelperDepth
        ? `config/helper${virtualConfigHelperDepth}.ts`
        : 'virtual-routes.ts',
      logs: () => logs,
      save,
      tree: () => readFile(file(`routeTree.gen.${generatedExtension}`), 'utf8'),
      rename: (from: string, to: string) => rename(file(from), file(to)),
      remove: (name: string) => rm(file(name)),
      assertAlive() {
        if (child!.exitCode !== null || child!.signalCode !== null) {
          throw new Error(`Bun exited\n${logs}`)
        }
      },
      async close() {
        if (child!.exitCode === null && child!.signalCode === null) {
          child!.kill()
          let timer: ReturnType<typeof setTimeout>
          await Promise.race([
            new Promise((resolve) => child!.once('exit', resolve)),
            new Promise((resolve) => {
              timer = setTimeout(resolve, 3_000)
            }),
          ]).finally(() => clearTimeout(timer!))
          if (child!.exitCode === null && child!.signalCode === null) {
            child!.kill('SIGKILL')
            await new Promise((resolve) => child!.once('exit', resolve))
          }
        }
        await rm(container, { recursive: true, force: true })
      },
    }
  } catch (error) {
    child?.kill('SIGKILL')
    if (child && child.exitCode === null && child.signalCode === null) {
      await new Promise((resolve) => child!.once('exit', resolve))
    }
    await rm(container, { recursive: true, force: true })
    throw error
  }
}
