import type {
  VanillaRouteComponent,
  VanillaErrorRouteComponent,
} from '../../src/types'

interface ComponentInstance {
  cleanup?: () => void
  getHtml: () => string
}

/**
 * RenderContext - Input data structure for the renderer
 *
 * This is a generic interface that any framework can implement
 * to provide component rendering data to VanillaRenderer.
 */
export interface RenderContext {
  component: VanillaRouteComponent | undefined
  pendingComponent?: VanillaRouteComponent
  errorComponent?: VanillaErrorRouteComponent
  error?: Error
  isPending?: boolean
  data?: any // Generic data object - can contain match data, props, etc.
}

/**
 * VanillaRenderer - Generic rendering engine for vanilla components
 *
 * This is a pure, framework-agnostic rendering utility that:
 * - Instantiates components and manages their lifecycle
 * - Recursively renders nested component trees
 * - Handles cleanup functions
 *
 * It has no knowledge of routers, routes, Outlets, or any framework-specific concepts.
 * It simply takes a tree of render contexts and produces HTML strings.
 *
 * Components are pure functions that return render functions.
 * The renderer provides context accessors that components can call
 * to get their data and child HTML.
 */
export class VanillaRenderer {
  private cleanupFunctions: Map<string, () => void> = new Map()
  private componentInstances: Map<string, ComponentInstance> = new Map()
  private currentContexts: Array<RenderContext> = []
  private currentIndex: number = -1
  private childHtmlCache: Map<number, string> = new Map()

  /**
   * Render a tree of component contexts to an HTML string
   *
   * @param contexts - Array of render contexts, ordered from root to leaf
   * @param router - Optional router instance to pass to components
   * @returns HTML string representation of the component tree
   */
  render(contexts: Array<RenderContext>, router?: any): string {
    // Clean up previous component instances
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

    // Set up context for this render cycle
    this.currentContexts = contexts

    // Store router globally for component access
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

  /**
   * Recursively render component contexts
   *
   * Components can access their data and child HTML via context functions
   * provided by the renderer.
   */
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

    // Set current index for context access
    const previousIndex = this.currentIndex
    this.currentIndex = index

    try {
      // Check for pending state
      if (context.isPending && context.pendingComponent) {
        const pendingInstance = this.createComponentInstance(
          context.pendingComponent,
          index,
          router,
        )
        // Pending components don't have children
        return pendingInstance.getHtml()
      }

      // Check for error state
      if (context.error && context.errorComponent) {
        const errorFactory = context.errorComponent({ error: context.error })
        const errorInstance = this.createComponentInstance(
          router ? errorFactory(router) : errorFactory,
          index,
          router,
        )
        // Error components don't have children
        return errorInstance.getHtml()
      }

      // Render the component
      const Component = context.component
      if (!Component) {
        // No component, render children
        return this.renderContexts(contexts, index + 1, router)
      }

      const instance = this.createComponentInstance(Component, index, router)
      this.componentInstances.set(String(index), instance)

      // Store cleanup function if present
      if (instance.cleanup) {
        this.cleanupFunctions.set(String(index), instance.cleanup)
      }

      // Render children first (if any) and cache the result
      const childHtml = this.renderContexts(contexts, index + 1, router)
      this.childHtmlCache.set(index, childHtml)

      // Set context again before calling getHtml() so getChildHtml() and getContextData() work
      const getContextData = () => this.currentContexts[index]?.data
      const getChildHtmlFn = () => this.childHtmlCache.get(index) || ''
      const renderContext = { data: getContextData, childHtml: getChildHtmlFn }
      ;(globalThis as any).__vanillaRendererContext = renderContext

      try {
        // Render this component - it can access childHtml via context
        let html = instance.getHtml()
        // Replace outlet marker with child HTML if present
        const OUTLET_MARKER = '__TANSTACK_ROUTER_OUTLET__'
        if (html.includes(OUTLET_MARKER)) {
          html = html.replace(OUTLET_MARKER, childHtml)
        }
        return html
      } finally {
        // Clear context after rendering
        delete (globalThis as any).__vanillaRendererContext
      }
    } finally {
      // Restore previous index
      this.currentIndex = previousIndex
    }
  }

  /**
   * Create a component instance from a component function
   *
   * Components can return:
   * - A render function: () => string
   * - A tuple with cleanup: [() => void, () => string]
   *
   * The render function can access context via getContext() and getChildHtml()
   */
  private createComponentInstance(
    component: VanillaRouteComponent,
    index: number,
    router?: any,
  ): ComponentInstance {
    // Create context accessors for this component
    const getContext = () => this.currentContexts[index]?.data
    const getChildHtml = () => this.childHtmlCache.get(index) || ''

    // Create a context object that components can access
    const context = {
      data: getContext,
      childHtml: getChildHtml,
    }

    // Store context globally so component can access it
    ;(globalThis as any).__vanillaRendererContext = context

    // Router components need router passed in
    const routerInstance = router || (globalThis as any).__tanstackRouter
    const result = routerInstance ? component(routerInstance) : component()

    // Clear context after component creation
    delete (globalThis as any).__vanillaRendererContext

    if (Array.isArray(result)) {
      const [cleanup, getHtml] = result
      return { cleanup, getHtml }
    } else {
      return { getHtml: result }
    }
  }

  /**
   * Render error state
   */
  private renderError(
    error: Error,
    errorComponent?: VanillaErrorRouteComponent,
    data?: any,
    router?: any,
  ): string {
    if (errorComponent) {
      // Set up context for error component
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

  /**
   * Clean up all component instances
   */
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

/**
 * Get the child HTML for the current component
 * Components can call this to embed child content
 */
export function getChildHtml(): string {
  const context = (globalThis as any).__vanillaRendererContext
  return context?.childHtml?.() || ''
}

/**
 * Get context data for the current component
 */
export function getContextData(): any {
  const context = (globalThis as any).__vanillaRendererContext
  return context?.data?.() || {}
}

// ============================================================================
// JSX Runtime
// ============================================================================

/**
 * JSX Runtime for Vanilla Renderer
 *
 * This provides JSX support for the vanilla renderer by converting JSX syntax
 * into HTML strings that work with the component system.
 *
 * Usage with TypeScript/JSX:
 * 1. Set jsx: "react" in tsconfig.json
 * 2. Set jsxFactory: "jsx" in tsconfig.json
 * 3. Import: import { jsx, Fragment } from '@tanstack/vanilla-router/jsx-runtime'
 * 4. Write components using JSX syntax
 *
 * The JSX factory converts JSX elements to HTML strings, which are then
 * composed together by the vanilla renderer's component system.
 */

/**
 * JSX Factory - converts JSX to HTML strings
 */
export function jsx(type: any, props: any, ...children: any[]): string {
  // Normalize children - handle undefined/null
  const normalizedChildren = children.filter(
    (child) => child !== undefined && child !== null,
  )

  // Handle fragments
  if (type === Symbol.for('react.fragment') || type === null) {
    return normalizedChildren.map((child) => renderChild(child)).join('')
  }

  // Handle components (functions)
  if (typeof type === 'function') {
    const componentResult = type(props || {})
    if (typeof componentResult === 'function') {
      // It's a render function - call it with children
      return componentResult(
        normalizedChildren.map((child) => renderChild(child)).join(''),
      )
    }
    return renderChild(componentResult)
  }

  // Handle HTML elements
  const tagName = String(type).toLowerCase()
  const attrs = props
    ? Object.entries(props)
        .filter(([key]) => key !== 'children')
        .map(([key, value]) => {
          // Special case: className -> class
          if (key === 'className') {
            return `class="${escapeHtml(String(value))}"`
          }
          // Convert camelCase to kebab-case for attributes
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
            // Handle dangerouslySetInnerHTML pattern for raw HTML insertion
            if (child && typeof child === 'object' && child.__html) {
              return child.__html
            }
            return renderChild(child)
          })
          .join('')
      : ''

  // Self-closing tags
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

/**
 * JSX Fragment factory (for compiled JSX)
 */
export function jsxs(type: any, props: any, ...children: any[]): string {
  return jsx(type, props, ...children)
}

/**
 * Fragment component for JSX
 */
export function Fragment({ children = [] }: { children?: any[] }): string {
  return (Array.isArray(children) ? children : [children])
    .filter((child) => child !== undefined && child !== null)
    .map((child) => renderChild(child))
    .join('')
}

/**
 * Render a child value to HTML string
 */
function renderChild(child: any): string {
  if (child === null || child === undefined || child === false) return ''
  // If child is already HTML (starts with <), don't escape it
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

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  if (typeof document === 'undefined') {
    // SSR fallback
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
