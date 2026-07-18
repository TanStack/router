import { describe, expect, it } from 'vitest'
import {
  compileCodeSplitReferenceRoute,
  compileCodeSplitVirtualRoute,
} from '../src/core/code-splitter/compilers'
import {
  getReferenceRouteCompilerPlugins,
  getVirtualRouteCompilerPlugins,
} from '../src/core/code-splitter/plugins/framework-plugins'
import type { CodeSplitGroupings } from '../src/core/constants'

const groupings: CodeSplitGroupings = [['component'], ['errorComponent']]

const code = `
import { createFileRoute } from '@tanstack/octane-router'
import { warmChild } from 'octane'

export const Route = createFileRoute('/posts')({
  component: PostsPage,
  errorComponent: PostsError,
})

function PostsPage() {}
PostsPage.$$singleRoot = true
PostsPage.__warm = (__wp) => { const props = __wp; warmChild(Child, props) }
try { PostsPage.__oct_loc = 'posts.tsrx:8:0' } catch { /* frozen component */ }

function PostsError() {}
PostsError.$$singleRoot = true
PostsError.__warm = (__wp) => { const props = __wp; warmChild(ErrorChild, props) }
try { PostsError.__oct_loc = PostsPage.__oct_loc } catch { /* frozen component */ }

PostsPage.$$singleRoot = false
PostsPage.__warm = userWarmPlan
PostsPage['__oct_loc'] = userLocation
PostsError.__warm = function (props) { userWarmChild(ErrorChild, props) }
try { PostsError.__oct_loc = 'user-location' } catch {}
PostsError.userMetadata = true
observe(PostsPage)
`

function compileReference() {
  return compileCodeSplitReferenceRoute({
    code,
    filename: 'posts.tsrx',
    id: 'posts.tsrx',
    addHmr: false,
    codeSplitGroupings: groupings,
    targetFramework: 'octane',
    compilerPlugins: getReferenceRouteCompilerPlugins({
      targetFramework: 'octane',
      addHmr: false,
    }),
  })!.code
}

describe('Octane code-split component companions', () => {
  it('removes compiler metadata for every extracted component', () => {
    const reference = compileReference()

    expect(reference).not.toContain('PostsPage.$$singleRoot = true')
    expect(reference).not.toContain('PostsPage.__warm = __wp =>')
    expect(reference).not.toContain("PostsPage.__oct_loc = 'posts.tsrx:8:0'")
    expect(reference).not.toContain('PostsError.$$singleRoot = true')
    expect(reference).not.toContain('PostsError.__warm = __wp =>')
    expect(reference).not.toContain(
      'PostsError.__oct_loc = PostsPage.__oct_loc',
    )
  })

  it('retains compiler metadata in each virtual component module', () => {
    const component = compileCodeSplitVirtualRoute({
      code,
      filename: 'posts.tsrx?tsr-split=component',
      splitTargets: ['component'],
    }).code
    const errorComponent = compileCodeSplitVirtualRoute({
      code,
      filename: 'posts.tsrx?tsr-split=errorComponent',
      splitTargets: ['errorComponent'],
    }).code

    expect(component).toContain('PostsPage.$$singleRoot = true')
    expect(component).toContain('PostsPage.__warm = __wp =>')
    expect(component).toContain("PostsPage.__oct_loc = 'posts.tsrx:8:0'")
    expect(errorComponent).toContain('PostsError.$$singleRoot = true')
    expect(errorComponent).toContain('PostsError.__warm = __wp =>')
    expect(errorComponent).toContain(
      'PostsError.__oct_loc = PostsPage.__oct_loc',
    )
  })

  it('preserves component and lazy wrapper identity across Vite updates', () => {
    const reference = compileCodeSplitReferenceRoute({
      code,
      filename: 'posts.tsrx',
      id: 'posts.tsrx',
      addHmr: true,
      hmrStyle: 'vite',
      codeSplitGroupings: groupings,
      targetFramework: 'octane',
      compilerPlugins: getReferenceRouteCompilerPlugins({
        targetFramework: 'octane',
        addHmr: true,
        hmrStyle: 'vite',
      }),
    })!.code
    const component = compileCodeSplitVirtualRoute({
      code,
      filename: 'posts.tsrx?tsr-split=component',
      splitTargets: ['component'],
      compilerPlugins: getVirtualRouteCompilerPlugins({
        targetFramework: 'octane',
        addHmr: true,
        hmrStyle: 'vite',
      }),
    }).code

    expect(reference).toContain('tsr-split-component:component')
    expect(reference).toContain('const TSRSplitComponent =')
    expect(component).toContain("from 'octane'")
    expect(component).toContain('import.meta.hot.accept()')
    expect(component).toContain(
      'TSROctaneComponentHotData["tsr-octane-split-component:component"][TSROctaneHmrSymbol].update(TSROctaneComponentCandidate)',
    )
    expect(component).toContain(
      'TSROctaneComponentHotData["tsr-octane-split-component:component"] = TSROctaneComponent',
    )
    expect(component).toContain('TSROctaneComponent.$$singleRoot')
    expect(component).toContain('export { TSROctaneComponent as component }')
  })

  it('invalidates routes for route dependencies but not split component dependencies', () => {
    const source = `
import { createFileRoute } from '@tanstack/octane-router'

const loaderValue = 'loader one'
const componentValue = 'component one'

export const Route = createFileRoute('/posts')({
  loader: () => loaderValue,
  component: PostsPage,
})

function PostsPage() {
  return componentValue
}
`
    const compileSignature = (input: string) => {
      const reference = compileCodeSplitReferenceRoute({
        code: input,
        filename: 'posts.tsrx',
        id: 'posts.tsrx',
        addHmr: true,
        hmrStyle: 'vite',
        codeSplitGroupings: [['component']],
        targetFramework: 'octane',
        compilerPlugins: getReferenceRouteCompilerPlugins({
          targetFramework: 'octane',
          addHmr: true,
          hmrStyle: 'vite',
        }),
      })!.code
      const match = reference.match(/const routeSignature = "([^"]+)"/)

      expect(match).not.toBeNull()
      return match![1]
    }

    const initialSignature = compileSignature(source)
    expect(
      compileSignature(source.replace('component one', 'component two')),
    ).toBe(initialSignature)
    expect(
      compileSignature(source.replace('loader one', 'loader two')),
    ).not.toBe(initialSignature)
  })

  it('hands the canonical component wrapper across webpack updates', () => {
    const component = compileCodeSplitVirtualRoute({
      code,
      filename: 'posts.tsrx?tsr-split=component',
      splitTargets: ['component'],
      compilerPlugins: getVirtualRouteCompilerPlugins({
        targetFramework: 'octane',
        addHmr: true,
        hmrStyle: 'webpack',
      }),
    }).code

    expect(component).toContain('import.meta.webpackHot')
    expect(component).toContain('tsr-octane-split-component:component')
    expect(component).toContain('TSROctaneComponentHot.dispose')
    expect(component).toContain('TSROctaneComponentHot.accept()')
    expect(component).not.toContain('import.meta.hot')
  })

  it('does not remove user-authored component expressions', () => {
    const reference = compileReference()

    expect(reference).toContain('PostsPage.$$singleRoot = false')
    expect(reference).toContain('PostsPage.__warm = userWarmPlan')
    expect(reference).toContain("PostsPage['__oct_loc'] = userLocation")
    expect(reference).toContain('PostsError.__warm = function')
    expect(reference).toContain("PostsError.__oct_loc = 'user-location'")
    expect(reference).toContain('PostsError.userMetadata = true')
    expect(reference).toContain('observe(PostsPage)')
  })
})
