/**
 * @deprecated Renders client components in Node with a framework's server
 * renderer and a hand-assembled plugin pipeline (RULES-AUDIT §2.D #5, R24):
 * client semantics belong in a real browser (`./plugin-host` `runClient`
 * on the served module with the real framework plugins). Kept for the
 * callers that have not moved yet (validation/REPAIR/A2.md).
 *
 * Real framework rendering of module graphs (`module-linker.ts`): compile the
 * graph's JSX with the framework's real transform and render what its
 * modules export with the framework's real server renderer, all from the
 * consumer's own installed packages (`packages` of the graph). No JSX or
 * renderer stand-in.
 *
 * API:
 * - `frameworkTransform(framework, packages)`: the `transform` option of a
 *   graph for `framework`. React: Vite's Oxc transform with React's automatic
 *   runtime (what `@vitejs/plugin-react` configures; the linker's default).
 *   Solid: `vite-plugin-solid`'s own transform (SSR output), Vue:
 *   `@vitejs/plugin-vue-jsx`'s own transform, each then TypeScript erased as
 *   Vite does after them.
 * - `renderToHtml(graph, framework, component, props)`: server-renders a
 *   component of the graph (a route component, a `RouterProvider`) with
 *   `react-dom/server`, `solid-js/web` or `vue/server-renderer`, using the
 *   graph's own instances of the framework. React renders static markup
 *   (no hydration comments); Solid's SSR output carries its hydration keys.
 *
 * Mounting, effects and hydration need a browser: see `browser.ts`.
 */
import { transformWithOxc } from 'vite'
import { createModuleGraph, moduleLang } from './module-linker'
import type { ModuleGraph, ModuleGraphOptions } from './module-linker'

/** A framework the router and Start support. */
export type Framework = 'react' | 'solid' | 'vue'

/** A graph that only imports packages, one per `packages` directory. */
const packageImporters = new Map<string, ModuleGraph>()

/** A real package installed for the consumer (`packages`), natively loaded. */
function importInstalled(specifier: string, packages: string) {
  let importer = packageImporters.get(packages)
  if (!importer) {
    importer = createModuleGraph({ packages })
    packageImporters.set(packages, importer)
  }
  return importer.importPackage(specifier)
}

/** A Vite plugin's hook given as a function or as `{ handler }`. */
type Hook = ((...args: Array<any>) => any) | { handler: (...args: any) => any }

function handler(hook: Hook | undefined) {
  return typeof hook === 'function' ? hook : hook?.handler
}

/** A Vite plugin configured for a production build, as Vite configures it. */
async function buildPlugin(plugin: Record<string, any>) {
  await handler(plugin.configResolved)?.call(
    {},
    {
      command: 'build',
      mode: 'production',
      isProduction: true,
      root: process.cwd(),
      build: { sourcemap: false },
    },
  )
  return (code: string, id: string, ssr: boolean): Promise<string | null> =>
    Promise.resolve(
      handler(plugin.transform)?.call({}, code, id, { ssr }),
    ).then((result: string | { code: string } | null | undefined) =>
      result == null ? null : typeof result === 'string' ? result : result.code,
    )
}

/** Erases TypeScript as Vite does after a framework plugin's transform. */
async function eraseTypeScript(code: string, id: string) {
  return (
    await transformWithOxc(code, 'module', {
      lang: moduleLang(id),
      typescript: { onlyRemoveTypeImports: true },
    })
  ).code
}

/**
 * The `transform` option of a module graph whose JSX is `framework`'s,
 * compiled by the framework's real Vite plugin (packages installed in
 * `packages`). `undefined` for React: the linker's default transform is
 * Vite's own React JSX transform.
 */
export function frameworkTransform(
  framework: Framework,
  packages: string,
): ModuleGraphOptions['transform'] {
  if (framework === 'react') {
    return undefined
  }
  let plugin:
    | Promise<
        (code: string, id: string, ssr: boolean) => Promise<string | null>
      >
    | undefined
  const pluginTransform = () => {
    plugin ??= (async () => {
      if (framework === 'solid') {
        const { default: solid } = await importInstalled(
          'vite-plugin-solid',
          packages,
        )
        return buildPlugin(solid({ ssr: true }))
      }
      const { default: vueJsx } = await importInstalled(
        '@vitejs/plugin-vue-jsx',
        packages,
      )
      return buildPlugin(vueJsx())
    })()
    return plugin
  }
  return async (code, id) => {
    // The server output of each framework (rendered by `renderToHtml`)
    const compiled = await (await pluginTransform())(code, id, true)
    return eraseTypeScript(compiled ?? code, id)
  }
}

/**
 * Server-renders `component` with `props` to HTML with the real renderer of
 * `framework`, using the framework instance the graph's modules use (the
 * graph links real packages: `packages`). A component that suspends without
 * a boundary fails the render (React), as on a server that does not wait.
 */
export async function renderToHtml(
  graph: ModuleGraph,
  framework: Framework,
  component: unknown,
  props: Record<string, unknown> = {},
): Promise<string> {
  if (framework === 'react') {
    const [{ createElement }, { renderToStaticMarkup }] = await Promise.all([
      graph.importPackage('react'),
      graph.importPackage('react-dom/server'),
    ])
    return renderToStaticMarkup(createElement(component, props))
  }
  if (framework === 'solid') {
    const { createComponent, renderToString } =
      await graph.importPackage('solid-js/web')
    return renderToString(() => createComponent(component, props))
  }
  const [{ createSSRApp, h }, { renderToString }] = await Promise.all([
    graph.importPackage('vue'),
    graph.importPackage('vue/server-renderer'),
  ])
  return renderToString(createSSRApp({ render: () => h(component, props) }))
}
