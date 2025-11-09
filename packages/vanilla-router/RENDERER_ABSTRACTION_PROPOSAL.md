# Vanilla Router Renderer Abstraction Proposal

## Goal

Make the vanilla router adapter **headless** (rendering-agnostic), supporting:

1. **Direct DOM API** - Manual DOM manipulation
2. **Component Renderer API** - Like the renderer we built

## Architecture

### Core Concept: Headless Router

The router adapter is completely headless - it only manages router state and navigation. Rendering is handled by a callback function provided by the user.

```typescript
interface RouterRenderState {
  matches: Array<{
    routeId: string
    component: any
    pendingComponent: any
    errorComponent: any
    loaderData: any
    params: Record<string, any>
    search: Record<string, any>
    isPending: boolean
    error: Error | null
  }>
  isNotFound: boolean
  notFoundError: any
  globalError: Error | null
}

type RenderCallback = (state: RouterRenderState) => void

class HeadlessRouter {
  constructor(router: AnyRouter, renderCallback: RenderCallback)
  setupLinkHandlers(rootElement: HTMLElement): void
  rerender(): void
  destroy(): void
}
```

### RouterRenderState

The router provides a normalized state object:

```typescript
interface RouterRenderState {
  matches: Array<{
    routeId: string
    component: Component | null
    pendingComponent: Component | null
    errorComponent: Component | null
    notFoundComponent: Component | null
    loaderData: any
    params: Record<string, any>
    search: Record<string, any>
    isPending: boolean
    error: Error | null
  }>
  isNotFound: boolean
  globalError: Error | null
}
```

## Two Renderer Implementations

### 1. Direct DOM Renderer

For manual DOM manipulation:

```typescript
class DirectDomRenderer implements RouterRenderer {
  render(state: RouterRenderState, rootElement: HTMLElement) {
    // Manual DOM manipulation
    rootElement.innerHTML = ''

    state.matches.forEach((match) => {
      if (match.error) {
        // Render error
        const errorDiv = document.createElement('div')
        errorDiv.textContent = match.error.message
        rootElement.appendChild(errorDiv)
        return
      }

      if (match.isPending && match.pendingComponent) {
        // Render pending
        const pendingDiv = document.createElement('div')
        pendingDiv.textContent = 'Loading...'
        rootElement.appendChild(pendingDiv)
        return
      }

      if (match.component) {
        // Call component with router context
        const componentResult = match.component({
          loaderData: match.loaderData,
          params: match.params,
          search: match.search,
          // ... other router context
        })

        // Component returns HTML string or DOM element
        if (typeof componentResult === 'string') {
          rootElement.innerHTML += componentResult
        } else {
          rootElement.appendChild(componentResult)
        }
      }
    })
  }
}
```

### 2. Component Renderer

For component-based rendering:

```typescript
class ComponentRenderer implements RouterRenderer {
  private renderer: VanillaRenderer

  render(state: RouterRenderState, rootElement: HTMLElement) {
    // Convert router state to render contexts
    const contexts = state.matches.map((match) => ({
      component: match.component,
      data: {
        loaderData: match.loaderData,
        params: match.params,
        search: match.search,
      },
      // ...
    }))

    this.renderer.render(contexts, rootElement)
  }
}
```

## Usage Examples

### Direct DOM Example

```typescript
import { HeadlessRouter } from '@tanstack/vanilla-router'

function renderToDOM(state: RouterRenderState, rootElement: HTMLElement) {
  rootElement.innerHTML = ''

  state.matches.forEach((match) => {
    if (match.component) {
      // Component is a simple function that returns HTML string
      const html = match.component()
      rootElement.innerHTML += html
    }
  })
}

const router = createRouter({ routeTree })
const headlessRouter = new HeadlessRouter(router, (state) => {
  renderToDOM(state, document.getElementById('app')!)
})
headlessRouter.setupLinkHandlers(document.getElementById('app')!)
```

Components in direct DOM mode are simple functions:

```typescript
component: () => {
  return '<div>Hello World</div>'
}
```

### Component Renderer Example

```typescript
import { HeadlessRouter, VanillaRenderer } from '@tanstack/vanilla-router'

const renderer = new VanillaRenderer()

function renderWithComponentRenderer(
  state: RouterRenderState,
  rootElement: HTMLElement,
) {
  const contexts = state.matches.map((match) => ({
    component: match.component,
    data: {
      loaderData: match.loaderData,
      params: match.params,
      search: match.search,
    },
  }))

  const html = renderer.render(contexts)
  rootElement.innerHTML = html
}

const router = createRouter({ routeTree })
const headlessRouter = new HeadlessRouter(router, (state) => {
  renderWithComponentRenderer(state, document.getElementById('app')!)
})
headlessRouter.setupLinkHandlers(document.getElementById('app')!)
```

## Component Types

Components can be:

1. **Direct DOM functions**:

```typescript
function MyComponent(ctx: RouterContext): string | HTMLElement {
  return `<div>Hello ${ctx.params.id}</div>`
}
```

2. **Component renderer functions**:

```typescript
function MyComponent(ctx: RouterContext): VanillaComponent {
  return () => `<div>Hello ${ctx.params.id}</div>`
}
```

The renderer decides how to handle each type.

## Benefits

1. **Flexibility** - Users can choose their rendering approach
2. **Separation of Concerns** - Router handles routing, renderer handles rendering
3. **Testability** - Easy to test router logic separately from rendering
4. **Extensibility** - Easy to add new renderer types (VDOM, etc.)

## Implementation

✅ **Completed:**

1. Created `HeadlessRouter` class - completely rendering-agnostic
2. Provides normalized `RouterRenderState` to render callback
3. Handles navigation and link clicks automatically
4. Examples showing both direct DOM and component renderer approaches

## Benefits

1. **Single Adapter** - One headless adapter works with any rendering approach
2. **Separation of Concerns** - Router handles routing, user handles rendering
3. **Flexibility** - Users can implement any rendering strategy
4. **Testability** - Easy to test router logic separately from rendering
5. **Extensibility** - Easy to add new rendering approaches (VDOM, etc.)
