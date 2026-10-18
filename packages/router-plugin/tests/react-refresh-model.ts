/**
 * React Refresh as an app runs it during a hot update, for the route HMR
 * harness (`hotUpdate` in `regression-helpers.ts`): the real refresh runtime
 * (`react-refresh/runtime`, which `@vitejs/plugin-react` copies and the
 * webpack / Rspack refresh plugins import), the code the bundler plugins add
 * around each module (registration under the module's id, Fast Refresh
 * boundaries), and how React renders a component type once the runtime
 * refreshed it.
 */
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  jsxPragma,
  moduleLang,
} from '@tanstack/compiler-test-utils/module-linker'
import { transformWithOxc } from 'vite'

const nodeRequire = createRequire(import.meta.url)

/**
 * Compiles a module the way the bundler's React Refresh setup does: JSX
 * (to the module linker's factories), TypeScript erased like a project
 * with `verbatimModuleSyntax`, and React Refresh's registrations and hook
 * signatures (`$RefreshReg$`, `$RefreshSig$`). Vite (`@vitejs/plugin-react`)
 * only adds them to modules with JSX (a `.jsx` / `.tsx` file, or one that
 * imports React's JSX runtime); the webpack and Rspack plugins to every
 * module their loader compiles.
 */
export async function transformWithRefresh(
  code: string,
  id: string,
  bundler: 'vite' | 'webpack',
) {
  const refresh =
    bundler === 'webpack' ||
    id.split('?')[0]!.endsWith('x') ||
    /\breact\/jsx-(?:dev-)?runtime\b/.test(code)
  const result = await transformWithOxc(code, 'module', {
    lang: moduleLang(id),
    jsx: { runtime: 'classic', ...jsxPragma, refresh: refresh ? {} : false },
    typescript: { onlyRemoveTypeImports: true },
  })
  return result.code
}

/** A component family: every version of one registered component. */
export type RefreshFamily = { current: unknown }

/** What `performReactRefresh()` returns: the families an update touched. */
export type RefreshUpdate = {
  /** Families React re-renders in place (same hook signature). */
  updatedFamilies: Set<RefreshFamily>
  /** Families React remounts (hook signature changed). */
  staleFamilies: Set<RefreshFamily>
}

/** The part of `react-refresh/runtime` the bundler plugins call. */
export type RefreshRuntime = {
  register: (type: unknown, id: string) => void
  createSignatureFunctionForTransform: () => (...args: Array<any>) => unknown
  performReactRefresh: () => RefreshUpdate | null
  getFamilyByType: (type: unknown) => RefreshFamily | undefined
  isLikelyComponentType: (type: unknown) => boolean
}

/**
 * A fresh instance of `react-refresh/runtime`: its families are module
 * state, and every app (every `hotUpdate`) starts with none.
 */
export function createRefreshRuntime(): RefreshRuntime {
  const entry = nodeRequire.resolve('react-refresh/runtime')
  const directory = path.dirname(entry)
  for (const id of Object.keys(nodeRequire.cache)) {
    if (id.startsWith(directory + path.sep)) {
      delete nodeRequire.cache[id]
    }
  }
  return nodeRequire(entry) as RefreshRuntime
}

const memoType = Symbol.for('react.memo')
const forwardRefType = Symbol.for('react.forward_ref')

/** The function a component type renders with: inside `memo` / `forwardRef`. */
export function componentFunction(type: unknown): unknown {
  let current: any = type
  while (current && typeof current === 'object') {
    if (current.$$typeof === memoType) {
      current = current.type
    } else if (current.$$typeof === forwardRefType) {
      current = current.render
    } else {
      break
    }
  }
  return current
}

/**
 * The function React calls to render a component type: the latest version
 * of its family once the runtime refreshed it (React's
 * `resolveFunctionForHotReloading`), else the function itself.
 */
export function resolveForRender(
  runtime: RefreshRuntime | undefined,
  type: unknown,
): unknown {
  const fn = componentFunction(type)
  const current = runtime?.getFamilyByType(fn)?.current
  return current === undefined || current === fn
    ? fn
    : resolveForRender(runtime, current)
}

/**
 * JSX factories (`__jsx`, `__Fragment`, see the module linker's `jsxPragma`)
 * that render to text like the linker's default ones, but call each
 * component the way React does after a refresh (`resolveForRender`).
 */
export function createRefreshingJsx(runtime: RefreshRuntime | undefined) {
  const Fragment = Symbol('Fragment')
  const h = (type: unknown, props: unknown, ...children: Array<unknown>) => {
    const text = children
      .flat(Infinity)
      .filter((child) => child != null && child !== false && child !== true)
      .join('')
    if (type === Fragment) {
      return text
    }
    if (typeof type === 'string') {
      return `<${type}>${text}</${type}>`
    }
    const render = resolveForRender(runtime, type)
    if (typeof render !== 'function') {
      throw new Error(`cannot render ${String(type)}`)
    }
    return render({ ...(props as object), children: text }, null)
  }
  return { __jsx: h, __Fragment: Fragment }
}

/**
 * `@vitejs/plugin-react`'s check of a hot update of a module it compiled
 * with React Refresh (its refresh runtime's
 * `validateRefreshBoundaryAndEnqueueUpdate`): a message when the module's
 * exports cannot be refreshed in place (the module then invalidates itself:
 * a full reload), else `undefined`. Exports listed by
 * `window.__getReactRefreshIgnoredExports` are not checked. Its own refresh
 * is a no-op here: the harness's runtime performs the refresh.
 */
export async function vitePluginReactBoundaryCheck(): Promise<
  (id: string, previous: object, next: object) => string | undefined
> {
  vitePluginReactRuntime ??= import(
    /* @vite-ignore */ pathToFileURL(
      path.join(
        path.dirname(nodeRequire.resolve('@vitejs/plugin-react')),
        'refresh-runtime.js',
      ),
    ).href
  )
  const runtime = await vitePluginReactRuntime
  return runtime.validateRefreshBoundaryAndEnqueueUpdate
}
let vitePluginReactRuntime: Promise<any> | undefined

/** What the webpack / Rspack refresh runtime keeps of a module's hot API. */
export type WebpackHot = {
  data?: Record<string, unknown>
  accept: (callback?: unknown) => void
  dispose: (callback: (data: Record<string, unknown>) => void) => void
  invalidate: () => void
}

/**
 * The code the webpack and Rspack React Refresh plugins run after each
 * module they compile (`executeRuntime` of `@rspack/plugin-react-refresh`'s
 * `refreshUtils.js`, from `@pmmmwh/react-refresh-webpack-plugin`): registers
 * the module's component exports; a module that exports only components is
 * a Fast Refresh boundary (it accepts its own updates and enqueues a
 * refresh), unless its exports changed shape, which invalidates it.
 */
export function webpackExecuteRuntime(
  runtime: RefreshRuntime,
  moduleExports: Record<string, unknown>,
  moduleId: string,
  hot: WebpackHot,
  enqueueUpdate: () => void,
) {
  for (const key in moduleExports) {
    if (runtime.isLikelyComponentType(moduleExports[key])) {
      runtime.register(moduleExports[key], `${moduleId} %exports% ${key}`)
    }
  }
  const isBoundary = (candidate: Record<string, unknown> | undefined) => {
    if (!candidate) {
      return false
    }
    const keys = Object.keys(candidate)
    return (
      keys.length > 0 &&
      keys.every((key) => runtime.isLikelyComponentType(candidate[key]))
    )
  }
  const signature = (candidate: Record<string, unknown>) =>
    Object.keys(candidate).flatMap((key) => [
      key,
      runtime.getFamilyByType(candidate[key]),
    ])
  const isHotUpdate = Boolean(hot.data)
  const previous = hot.data?.prevExports as Record<string, unknown> | undefined
  if (isBoundary(moduleExports)) {
    hot.dispose((data) => {
      data.prevExports = moduleExports
    })
    hot.accept()
    if (isHotUpdate) {
      const before = previous && isBoundary(previous) ? signature(previous) : []
      const after = signature(moduleExports)
      const changed =
        before.length > 0 &&
        (before.length !== after.length ||
          after.some((item, index) => item !== before[index]))
      if (changed) {
        hot.invalidate()
      } else {
        enqueueUpdate()
      }
    }
  } else if (isHotUpdate && isBoundary(previous)) {
    hot.invalidate()
  }
}
