// Copy of the renderer from packages/vanilla-router/examples/renderer/renderer.ts
// This allows the example to work independently

import type {
  VanillaRouteComponent,
  VanillaErrorRouteComponent,
} from '@tanstack/vanilla-router'

interface ComponentInstance {
  cleanup?: () => void
  getHtml: () => string
}

export interface RenderContext {
  component: VanillaRouteComponent | undefined
  pendingComponent?: VanillaRouteComponent
  errorComponent?: VanillaErrorRouteComponent
  error?: Error
  isPending?: boolean
  data?: any
}

export class VanillaRenderer {
  private cleanupFunctions: Map<string, () => void> = new Map()
  private componentInstances: Map<string, ComponentInstance> = new Map()
  private currentContexts: Array<RenderContext> = []
  private currentIndex: number = -1
  private childHtmlCache: Map<number, string> = new Map()

  render(contexts: Array<RenderContext>, router?: any): string {
    this.cleanupFunctions.forEach((cleanup) => {
      try {
        cleanup()
      } catch (error) {
        console.error('Error during component cleanup:', error)
      }
    })
    this.cleanupFunctions.clear()
    this.componentInstances.clear()
    this.childHtmlCache.clear()

    if (contexts.length === 0) {
      return ''
    }

    this.currentContexts = contexts

    if (router) {
      ;(globalThis as any).__tanstackRouter = router
    }

    try {
      return this.renderContexts(contexts, 0, router)
    } catch (error) {
      return this.renderError(
        error as Error,
        contexts[0]?.errorComponent,
        contexts[0]?.data,
        router,
      )
    } finally {
      if (router) {
        delete (globalThis as any).__tanstackRouter
      }
    }
  }

  private renderContexts(
    contexts: Array<RenderContext>,
    index: number,
    router?: any,
  ): string {
    if (index >= contexts.length) {
      return ''
    }

    const context = contexts[index]
    if (!context) {
      return ''
    }

    const previousIndex = this.currentIndex
    this.currentIndex = index

    try {
      if (context.isPending && context.pendingComponent) {
        const pendingInstance = this.createComponentInstance(
          context.pendingComponent,
          index,
          router,
        )
        return pendingInstance.getHtml()
      }

      if (context.error && context.errorComponent) {
        const errorFactory = context.errorComponent({ error: context.error })
        const errorInstance = this.createComponentInstance(
          router ? errorFactory(router) : errorFactory,
          index,
          router,
        )
        return errorInstance.getHtml()
      }

      const Component = context.component
      if (!Component) {
        return this.renderContexts(contexts, index + 1, router)
      }

      const instance = this.createComponentInstance(Component, index, router)
      this.componentInstances.set(String(index), instance)

      if (instance.cleanup) {
        this.cleanupFunctions.set(String(index), instance.cleanup)
      }

      const childHtml = this.renderContexts(contexts, index + 1, router)
      this.childHtmlCache.set(index, childHtml)

      const getContextData = () => this.currentContexts[index]?.data
      const getChildHtmlFn = () => this.childHtmlCache.get(index) || ''
      const renderContext = { data: getContextData, childHtml: getChildHtmlFn }
      ;(globalThis as any).__vanillaRendererContext = renderContext

      try {
        let html = instance.getHtml()
        const OUTLET_MARKER = '__TANSTACK_ROUTER_OUTLET__'
        if (html.includes(OUTLET_MARKER)) {
          html = html.replace(OUTLET_MARKER, childHtml)
        }
        return html
      } finally {
        delete (globalThis as any).__vanillaRendererContext
      }
    } finally {
      this.currentIndex = previousIndex
    }
  }

  private createComponentInstance(
    component: VanillaRouteComponent,
    index: number,
    router?: any,
  ): ComponentInstance {
    const getContext = () => this.currentContexts[index]?.data
    const getChildHtml = () => this.childHtmlCache.get(index) || ''

    const context = {
      data: getContext,
      childHtml: getChildHtml,
    }

    ;(globalThis as any).__vanillaRendererContext = context

    const routerInstance = router || (globalThis as any).__tanstackRouter
    const result = routerInstance ? component(routerInstance) : component()

    delete (globalThis as any).__vanillaRendererContext

    if (Array.isArray(result)) {
      const [cleanup, getHtml] = result
      return { cleanup, getHtml }
    } else {
      return { getHtml: result }
    }
  }

  private renderError(
    error: Error,
    errorComponent?: VanillaErrorRouteComponent,
    data?: any,
    router?: any,
  ): string {
    if (errorComponent) {
      const context = { data: () => data, childHtml: () => '' }
      ;(globalThis as any).__vanillaRendererContext = context

      const routerInstance = router || (globalThis as any).__tanstackRouter
      const errorFactory = errorComponent({ error })
      const instance = this.createComponentInstance(
        routerInstance ? errorFactory(routerInstance) : errorFactory,
        0,
        routerInstance,
      )
      delete (globalThis as any).__vanillaRendererContext

      return instance.getHtml()
    } else {
      return `<div>Error: ${error.message || String(error)}</div>`
    }
  }

  destroy() {
    this.cleanupFunctions.forEach((cleanup) => {
      try {
        cleanup()
      } catch (error) {
        console.error('Error during component cleanup:', error)
      }
    })
    this.cleanupFunctions.clear()
    this.componentInstances.clear()
    this.childHtmlCache.clear()
    this.currentContexts = []
  }
}

function escapeHtml(text: string): string {
  if (typeof document === 'undefined') {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }
  const div = document.createElement('div')
  div.textContent = String(text)
  return div.innerHTML
}

function renderChild(child: any): string {
  if (child === null || child === undefined || child === false) return ''
  if (typeof child === 'string' && child.trim().startsWith('<')) {
    return child
  }
  if (typeof child === 'string' || typeof child === 'number')
    return escapeHtml(String(child))
  if (Array.isArray(child)) return child.map(renderChild).join('')
  if (
    typeof child === 'object' &&
    child.$$typeof === Symbol.for('react.element')
  ) {
    return jsx(child.type, child.props)
  }
  return String(child)
}

export function jsx(type: any, props: any, ...children: any[]): string {
  const normalizedChildren = children.filter(
    (child) => child !== undefined && child !== null,
  )

  if (type === Symbol.for('react.fragment') || type === null) {
    return normalizedChildren.map((child) => renderChild(child)).join('')
  }

  if (typeof type === 'function') {
    const componentResult = type(props || {})
    if (typeof componentResult === 'function') {
      return componentResult(
        normalizedChildren.map((child) => renderChild(child)).join(''),
      )
    }
    return renderChild(componentResult)
  }

  const tagName = String(type).toLowerCase()
  const attrs = props
    ? Object.entries(props)
        .filter(([key]) => key !== 'children')
        .map(([key, value]) => {
          if (key === 'className') {
            return `class="${escapeHtml(String(value))}"`
          }
          const attrName = key.replace(/([A-Z])/g, '-$1').toLowerCase()
          if (value === true) return attrName
          if (value === false || value === null || value === undefined)
            return ''
          return `${attrName}="${escapeHtml(String(value))}"`
        })
        .filter(Boolean)
        .join(' ')
    : ''

  const childrenHtml =
    normalizedChildren.length > 0
      ? normalizedChildren
          .map((child) => {
            if (child && typeof child === 'object' && child.__html) {
              return child.__html
            }
            return renderChild(child)
          })
          .join('')
      : ''

  const selfClosingTags = [
    'input',
    'img',
    'br',
    'hr',
    'meta',
    'link',
    'area',
    'base',
    'col',
    'embed',
    'source',
    'track',
    'wbr',
  ]
  if (selfClosingTags.includes(tagName)) {
    return `<${tagName}${attrs ? ' ' + attrs : ''} />`
  }

  return `<${tagName}${attrs ? ' ' + attrs : ''}>${childrenHtml}</${tagName}>`
}

export function jsxs(type: any, props: any, ...children: any[]): string {
  return jsx(type, props, ...children)
}

export function Fragment({ children = [] }: { children?: any[] }): string {
  return (Array.isArray(children) ? children : [children])
    .filter((child) => child !== undefined && child !== null)
    .map((child) => renderChild(child))
    .join('')
}
