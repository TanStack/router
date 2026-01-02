# Challenges of Implementing Router Adapters

## Overview

TanStack Router's core is framework-agnostic, but each framework requires a custom adapter to bridge the gap between the router's reactive state management and the framework's rendering model. This document outlines the key challenges when implementing adapters for frameworks like Angular and Vue that differ significantly from React/Solid.

---

## Table of Contents

1. [Component Rendering Challenges](#component-rendering-challenges)
2. [Context/State Propagation](#contextstate-propagation)
3. [Reactivity Models](#reactivity-models)
4. [Template Syntax Limitations](#template-syntax-limitations)
5. [Dynamic Component Loading](#dynamic-component-loading)
6. [Error Boundaries](#error-boundaries)
7. [SSR Considerations](#ssr-considerations)
8. [Angular: Simplified Approach with Signal Inputs](#angular-simplified-approach-with-signal-inputs)

---

## Component Rendering Challenges

### React/Solid Approach (JSX)

In React and Solid, components are just functions that return JSX. This makes dynamic rendering straightforward:

```tsx
// React/Solid - Simple and direct
const MatchInner = ({ matchId }) => {
  const route = router.routesById[routeId]
  const Component = route.options.component

  if (Component) {
    return <Component />
  }
  return <Outlet />
}
```

**Why this works:**

- JSX is just function calls: `<Component />` → `React.createElement(Component)` or Solid's JSX
- Components are first-class values that can be stored and passed around
- No template compilation needed
- Easy to conditionally render different components

**Solid-specific advantages:**

- Fine-grained reactivity: Only affected DOM nodes update
- No virtual DOM: Direct DOM updates
- Signals integrate naturally with router state

### Angular Approach (Templates)

Angular uses declarative templates with a compiled component system:

```typescript
// Angular - Requires ViewContainerRef and ComponentFactory
@Component({
  selector: 'route-match',
  template: ``, // Empty! We render dynamically
})
export class RouteMatch {
  private vcr = inject(ViewContainerRef)
  private cmpRef?: ComponentRef<any>

  constructor() {
    // Subscribe to router state
    routerState$.subscribe((state) => {
      const route = router.routesById[routeId]
      const Component = route.options.component

      // Clear previous component
      this.vcr.clear()

      // Dynamically create and insert component
      if (Component) {
        this.cmpRef = this.vcr.createComponent(Component, {
          injector: this.createInjectorForMatch(match),
        })
        this.cmpRef.changeDetectorRef.markForCheck()
      }
    })
  }
}
```

**Challenges:**

1. **No JSX**: Can't just return `<Component />` - must use `ViewContainerRef.createComponent()`
2. **Manual Lifecycle**: Must manually manage component creation/destruction
3. **Change Detection**: Must explicitly call `markForCheck()` or use `OnPush` strategy
4. **Injector Management**: Need to create custom injectors to pass route context
5. **Template Compilation**: Components must be registered in Angular's module system

### Vue Approach (Templates + Render Functions)

Vue supports both templates and render functions, but still has limitations:

```typescript
// Vue - Uses h() render function
export const MatchInner = Vue.defineComponent({
  setup(props) {
    const route = Vue.computed(() => router.routesById[routeId.value])

    const Component = Vue.computed(() => route.value?.options.component)

    return () => {
      if (Component.value) {
        return Vue.h(Component.value)
      }
      return Vue.h(Outlet)
    },
  },
})
```

**Challenges:**

1. **Render Function Syntax**: Must use `Vue.h()` instead of JSX (though JSX is possible with plugins)
2. **Component Registration**: Components need to be registered or imported
3. **Fragment Handling**: Vue 3 has implicit fragments that can cause hydration mismatches
4. **Slot Context**: Passing context through slots is more complex than React props

---

## Context/State Propagation

### React Context Pattern

React's Context API is simple and direct:

```tsx
// React - Simple context propagation
const RouterContext = createContext<AnyRouter>()

// Provide
<RouterContext.Provider value={router}>
  {children}
</RouterContext.Provider>

// Consume
const router = useContext(RouterContext)
```

**Why this works:**

- Context flows naturally through the component tree
- No additional setup needed
- Type-safe with TypeScript

### Angular Dependency Injection

Angular uses a hierarchical injector system with two types of injectors:

#### Two Types of Injectors

Angular has two distinct injector types that serve different purposes:

1. **`Injector` (Component Injector)**: Component-scoped, instance-specific
   - Used for component-level dependencies
   - Scoped to a specific component instance and its view
   - Created with `Injector.create()`
   - Used for route context, match data, params, etc.

2. **`EnvironmentInjector`**: Environment-scoped, shared across component tree
   - Used for environment-level providers (services, singletons)
   - Shared across all components in a route hierarchy
   - Created with `createEnvironmentInjector()`
   - Used for route-level providers from `route.options.providers`

#### How They're Used in the Router

```typescript
// Component Injector - for instance-specific context
const injector = this.router.getRouteInjector(
  route.id,
  this.injector, // parent component injector
  [
    { provide: MATCH_ID, useValue: match.id },
    { provide: PARAMS, useValue: match.params },
    { provide: SEARCH, useValue: match.search },
    { provide: LOADER_DATA, useValue: match.data },
  ],
)

// Environment Injector - for shared services/providers
const environmentInjector = this.router.getRouteEnvInjector(
  route.id,
  this.environmentInjector, // parent environment injector
  route.options.providers || [], // route-level providers
  this.router,
)

// When creating component, both can be provided
this.vcr.createComponent(component, {
  injector: injector, // Component-scoped dependencies
  environmentInjector: environmentInjector, // Environment-scoped dependencies
})
```

#### Why Two Injectors?

**Component Injector (`injector`):**

- **Purpose**: Instance-specific data that changes per component
- **Examples**: Route params, search params, loader data, match ID
- **Scope**: Only available to this specific component instance
- **Lifecycle**: Tied to component lifecycle
- **Source**: Created by router for each match

**Environment Injector (`environmentInjector`):**

- **Purpose**: **Route-level providers** defined via `route.options.providers`
- **Examples**: Route-level services, singletons, shared state
- **Scope**: Available to all components in the route tree
- **Lifecycle**: Persists across component instances in the route
- **Source**: Collected from `route.options.providers` up the route hierarchy

**Key Point**: The `environmentInjector` is specifically designed to support `route.options.providers`, allowing you to define Angular providers at the route level that are automatically available to all components in that route's component tree.

**Note**: Angular is the **only adapter** that adds non-component-related route options. Other adapters only extend component types for framework-specific component definitions.

#### Example Usage

```typescript
// Route definition with providers
export const postsRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/posts',
  component: PostsComponent,
  providers: [
    // These providers go into environmentInjector
    // They're collected by getRouteEnvInjector() which walks
    // up the route hierarchy and collects all route.options.providers
    { provide: PostsService, useClass: PostsService },
    { provide: ANALYTICS_TOKEN, useValue: analyticsConfig },
  ],
})

// In component, you can inject both types:
export class PostComponent {
  // From component injector (instance-specific)
  params = inject(PARAMS) // Route params
  search = inject(SEARCH) // Search params
  loaderData = inject(LOADER_DATA) // Loader data

  // From environment injector (route.options.providers)
  postsService = inject(PostsService) // Available because of route.options.providers
  analytics = inject(ANALYTICS_TOKEN) // Available because of route.options.providers
}
```

#### How Route Providers Are Collected

The `getRouteEnvInjector` method walks up the route hierarchy to collect all providers:

```typescript
// From router.ts - getRouteEnvInjector implementation
let route = router.routesById[routeId]
const providers: Provider[] = []

// Walk up the route hierarchy
while (route) {
  if (route.options?.providers) {
    providers.push(...route.options.providers) // Collect providers
  }
  route = route.parentRoute // Move to parent route
}

// Create environment injector with all collected providers
const envInjector = createEnvironmentInjector(providers, parent, routeId)
```

This means:

- Providers from parent routes are inherited
- Each route can add its own providers
- All providers are available to components in that route's tree

#### Hierarchical Structure

```
Root EnvironmentInjector
  └─ Route A EnvironmentInjector (route.options.providers)
      └─ Route B EnvironmentInjector
          └─ Component Instance
              └─ Component Injector (MATCH_ID, PARAMS, etc.)
```

**Challenges:**

1. **Observable Conversion**: Router state is a Store, but Angular prefers Observables
   - Must convert `router.__store.subscribe()` → `BehaviorSubject` → `Observable`
   - Need to handle subscription cleanup

2. **Dual Injector System**: Must manage both injector types
   - Component injector for instance data
   - Environment injector for shared services
   - Both must be created and passed to `createComponent()`

3. **Hierarchical Injectors**: Each route match needs its own injectors with:
   - Route-specific context (params, search, loader data) → Component Injector
   - Route-level providers (services) → Environment Injector
   - Parent route context
   - Router context

4. **Injector Creation**: Must create custom injectors for each match:

   ```typescript
   // Component injector - instance-specific
   const injector = Injector.create({
     providers: [
       { provide: MATCH_ID, useValue: matchId },
       { provide: PARAMS, useValue: match.params },
       { provide: SEARCH, useValue: match.search },
       { provide: LOADER_DATA, useValue: match.data },
     ],
     parent: parentInjector,
   })

   // Environment injector - shared services
   const environmentInjector = createEnvironmentInjector(
     route.options.providers || [],
     parentEnvironmentInjector,
     routeId,
   )
   ```

5. **Signal vs Observable**: Angular now has Signals, but router state is Observable-based
   - Need to convert: `toSignal(routerState$)` or use `computed()`

### Vue Provide/Inject

Vue uses provide/inject for dependency injection:

```typescript
// Vue - Provide/Inject
export const RouterSymbol = Symbol('TanStackRouter') as InjectionKey<AnyRouter>

// Provide
export function provideRouter(router: AnyRouter) {
  Vue.provide(RouterSymbol, router)
}

// Inject
export function injectRouter() {
  const router = Vue.inject<AnyRouter | null>(RouterSymbol, null)
  if (!router) {
    throw new Error('No router found')
  }
  return router
}
```

**Challenges:**

1. **Reactive State**: Router state is not Vue-reactive by default
   - Must use `useRouterState()` hook that wraps router state in `computed()`
   - Need to manually track dependencies

2. **Match Context**: Each match needs its own context

   ```typescript
   // Provide matchId to children
   const matchIdRef = Vue.ref(matchId)
   Vue.provide(matchContext, matchIdRef)

   // Children inject it
   const matchId = Vue.inject(matchContext)
   ```

3. **Stale Props Problem**: During same-route transitions, props can be stale
   - Must track `lastKnownRouteId` and fallback logic
   - Complex selector logic to handle transitions

---

## Reactivity Models

### React: Hooks + Re-renders

```tsx
// React - Automatic re-renders on state change
const useRouterState = (selector) => {
  const [, forceUpdate] = useState({})
  const router = useRouter()

  useEffect(() => {
    return router.__store.subscribe(({ currentVal }) => {
      const selected = selector(currentVal)
      if (selected !== prevSelected) {
        forceUpdate({}) // Trigger re-render
      }
    })
  }, [])

  return selector(router.state)
}
```

**Why this works:**

- Simple subscription model
- React handles re-renders automatically
- `useState` triggers re-render when updated

### Solid: Signals + Fine-grained Reactivity

```typescript
// Solid - Native signals with fine-grained reactivity
export function useRouterState<TRouter, TSelected>(opts: {
  select?: (state: RouterState) => TSelected
}) {
  const router = useRouter()

  return useStore(
    router.__store,
    (state) => {
      if (opts?.select) return opts.select(state)
      return state
    },
    {
      equal: deepEqual, // Structural sharing
    },
  ) as Accessor<TSelected>
}
```

**Why this works:**

- **Native Signals**: Solid's `useStore` returns an `Accessor` (signal)
- **Fine-grained Updates**: Only components using the signal re-render
- **Direct Integration**: `@tanstack/solid-store` provides `useStore` hook
- **No Re-renders**: Solid updates DOM directly, no component re-renders

**Advantages:**

- Most performant - only affected DOM nodes update
- No virtual DOM overhead
- Signals are first-class in Solid
- Natural fit with router's Store

### Angular: Signals (Direct or via Observables)

Angular supports Signals natively (Angular 16+). The current adapter implementation uses Observables as an intermediate step, but **this is not required** - it could convert directly from Store to Signal:

```typescript
// Current implementation: Store → Observable → Signal
export function routerState$<TSelected>(opts: {
  select: (state: RouterState) => TSelected
}): Observable<TSelected> {
  const router = injectRouter()
  const state$ = new BehaviorSubject(router.state)

  router.__store.subscribe(({ currentVal }) => {
    state$.next(currentVal)
  })

  return state$.pipe(map(opts.select), distinctUntilChanged())
}

// Signal via Observable (current approach)
export function routerState<TSelected>(opts: {
  select: (state: RouterState) => TSelected
}): Signal<TSelected> {
  return toSignal(
    routerState$(opts), // Observable intermediate step
    { injector },
  )
}

// Alternative: Direct Store → Signal (not currently implemented)
export function routerStateDirect<TSelected>(opts: {
  select: (state: RouterState) => TSelected
}): Signal<TSelected> {
  const router = injectRouter()
  const stateSignal = signal(router.state)

  effect(() => {
    const unsubscribe = router.__store.subscribe(({ currentVal }) => {
      stateSignal.set(currentVal)
    })
    return () => unsubscribe()
  })

  return computed(() => {
    const state = stateSignal()
    return opts.select ? opts.select(state) : state
  })
}
```

**Current Implementation (Observable-based):**

- Provides both `routerState$()` (Observable) and `routerState()` (Signal)
- Observable step allows backward compatibility
- Signal version uses `toSignal()` to convert Observable → Signal

**Potential Direct Signal Implementation:**

- Could use `effect()` to subscribe directly to `router.__store`
- Use `computed()` for selectors
- Similar pattern to Solid's `useStore`
- Would eliminate Observable intermediate step

**Challenges:**

1. **Dual Model Support**: Current implementation supports both
   - `routerState$()` returns Observable (for RxJS-based code)
   - `routerState()` returns Signal (for modern Angular)
   - Observable step provides backward compatibility

2. **Change Detection Strategy**: Must use `OnPush` for performance
   - Components won't update unless explicitly marked
   - Signals automatically trigger change detection
   - Observables require `markForCheck()` or `async` pipe

3. **Template Syntax**: Different syntax for each model

   ```html
   <!-- Observable approach -->
   <div *ngIf="routerState$ | async as state">{{ state.matches.length }}</div>

   <!-- Signal approach -->
   <div *ngIf="routerState() as state">{{ state.matches.length }}</div>
   ```

4. **Subscription Management**:
   - Observables: Must unsubscribe manually
   - Signals: Automatic cleanup via `effect()`

**Note**: The Observable intermediate step is a design choice for backward compatibility, not a requirement. A pure Signal-based implementation would be more similar to Solid's approach and could eliminate the Observable layer entirely.

### Vue: Computed + Reactive (Signal-like)

```typescript
// Vue - Computed reactivity (signal-like)
export function useRouterState<TSelected>(opts: {
  select: (state: RouterState) => TSelected
}) {
  const router = injectRouter()

  // Vue 3 uses @tanstack/vue-store which wraps Store in computed
  return useStore(router.__store, (state) => {
    if (opts?.select) return opts.select(state)
    return state
  }) as Vue.Ref<TSelected>
}
```

**How it works:**

- `@tanstack/vue-store` provides `useStore` hook
- Wraps router's Store in Vue's reactivity system
- Returns a `Ref` (Vue's signal-like primitive)

**Challenges:**

1. **Reactive Proxy**: Router state must be reactive
   - Store is not Vue-reactive by default
   - `useStore` wraps it in `computed()` internally

2. **Deep Reactivity**: Nested objects need deep reactivity
   - Vue 3's `shallowRef` vs `ref`
   - Must be careful with structural sharing

3. **Watch Dependencies**: Must track all accessed properties

   ```typescript
   // This won't work - router.state is not reactive
   const matches = router.state.matches

   // Must use computed/useStore
   const matches = useRouterState({ select: (s) => s.matches })
   ```

---

## Signals: A Common Pattern

All three frameworks (Solid, Angular, Vue) can use signal-like patterns, but with different implementations:

### Signal Comparison

| Framework   | Signal Type                 | Integration                   | Performance                        |
| ----------- | --------------------------- | ----------------------------- | ---------------------------------- |
| **Solid**   | Native `Accessor`           | Direct via `useStore`         | ⭐⭐⭐⭐⭐ Finest-grained          |
| **Angular** | `Signal<T>` (Angular 16+)   | Via `toSignal(Observable)`    | ⭐⭐⭐⭐ Good (with OnPush)        |
| **Vue**     | `Ref<T>` / `ComputedRef<T>` | Via `useStore` wrapper        | ⭐⭐⭐⭐ Good (with computed)      |
| **React**   | N/A (uses hooks)            | Via `useState` + subscription | ⭐⭐⭐ Re-renders entire component |

### Store → Signal Conversion

All adapters need to convert the router's Store to framework-native signals:

```typescript
// Router Core: Store-based
router.__store.subscribe(({ currentVal }) => {
  // State changed
})

// Solid: Direct signal access (native)
const state = useStore(router.__store, selector) // Returns Accessor<T>
// Direct integration, no conversion needed

// Angular: Current (Observable intermediate)
const state$ = routerState$(opts) // Observable<T>
const state = toSignal(state$) // Signal<T>
// Could be simplified to direct Store → Signal

// Angular: Potential direct approach
const state = computed(() => {
  // Subscribe to store directly via effect
  return selector(router.__store.state)
})

// Vue: Computed wrapper
const state = useStore(router.__store, selector) // Returns Ref<T>
// Wraps Store in Vue's reactivity system
```

### Benefits of Signal-based Approaches

1. **Fine-grained Updates**: Only affected parts re-render
2. **Automatic Tracking**: Dependencies tracked automatically
3. **Better Performance**: Less overhead than full component re-renders
4. **Type Safety**: Signals are type-safe in all frameworks

### Challenges with Signals

1. **Conversion Overhead**:
   - **Angular (current)**: Store → Observable → Signal (intermediate step for compatibility)
   - **Angular (potential)**: Store → Signal (direct, similar to Solid)
   - **Vue**: Store → Computed/Ref (wrapped in reactivity system)
   - **Solid**: Store → Accessor (direct, native)

2. **Reactivity Wrapping**: Must wrap Store in framework reactivity (Vue, Angular if using computed)

3. **Template Syntax**: Different syntax for each framework

4. **Migration**: Angular currently supports both Observable and Signal patterns, but could be simplified to Signals-only

---

## Angular: Simplified Approach with Signal Inputs

### Problem Statement

The Angular adapter faces two main challenges:

1. **Injection**: Complex hierarchical injector management for route context
2. **Rendering**: Dynamic component creation via `ViewContainerRef`

The current implementation mixes these concerns in `RouteMatch`, using Observables to drive component creation.

### Proposed Solution: DynamicComponent Wrapper

Create a reusable wrapper component that accepts signal inputs for both the component and injector, separating concerns:

```typescript
@Component({
  selector: 'dynamic-component',
  template: ``,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DynamicComponent {
  // Signal inputs for component and injector
  component = input<Type<any> | null>(null)
  injector = input<Injector | null>(null)
  environmentInjector = input<EnvironmentInjector | null>(null)

  private vcr = inject(ViewContainerRef)
  private cmpRef?: ComponentRef<any>
  private currentComponent?: Type<any>

  constructor() {
    // Watch signal inputs and react to changes
    effect(() => {
      const component = this.component()
      const injector = this.injector()
      const envInjector = this.environmentInjector()

      // If component hasn't changed, just update change detection
      if (component === this.currentComponent && this.cmpRef) {
        this.cmpRef.changeDetectorRef.markForCheck()
        return
      }

      // Clear previous component
      this.vcr.clear()
      this.currentComponent = component

      // Create new component if provided
      if (component) {
        this.cmpRef = this.vcr.createComponent(component, {
          injector: injector || undefined,
          environmentInjector: envInjector || undefined,
        })
        this.cmpRef.changeDetectorRef.markForCheck()
      } else {
        this.cmpRef = undefined
      }
    })
  }
}
```

### Simplified RouteMatch

With the wrapper component, `RouteMatch` becomes much simpler:

```typescript
@Component({
  selector: 'route-match',
  template: `
    <dynamic-component
      [component]="component()"
      [injector]="injector()"
      [environmentInjector]="environmentInjector()"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RouteMatch {
  matchId = input.required<string>()

  private router = injectRouter()
  private parentInjector = inject(Injector)
  private parentEnvInjector = inject(EnvironmentInjector)

  // Compute component signal from router state
  private routeId = computed(() => {
    const match = this.router.state.matches.find((m) => m.id === this.matchId())
    return match?.routeId as string
  })

  private route = computed(() => {
    const id = this.routeId()
    return id ? this.router.routesById[id] : null
  })

  private match = computed(() => {
    return this.router.state.matches.find((m) => m.id === this.matchId())
  })

  // Component signal - determines what to render
  component = computed(() => {
    const match = this.match()
    const route = this.route()

    if (!match || !route) return null

    // Handle different match statuses
    if (match.status === 'notFound') {
      return (
        route.options.notFoundComponent?.() ||
        this.router.options.defaultNotFoundComponent?.() ||
        DefaultNotFound
      )
    }

    if (match.status === 'error') {
      return (
        route.options.errorComponent?.() ||
        this.router.options.defaultErrorComponent?.() ||
        DefaultError
      )
    }

    if (match.status === 'pending' || match.status === 'redirected') {
      return (
        route.options.pendingComponent?.() ||
        this.router.options.defaultPendingComponent?.()
      )
    }

    if (match.status === 'success') {
      return route.options.component?.() || Outlet
    }

    return null
  })

  // Injector signal - provides route context
  injector = computed(() => {
    const match = this.match()
    const route = this.route()

    if (!match || !route) return null

    // Create route-specific injector
    const routeInjector = this.router.getRouteInjector(
      route.id,
      this.parentInjector,
    )

    // Add match-specific providers
    return Injector.create({
      providers: [
        { provide: MATCH_ID, useValue: match.id },
        {
          provide: MATCH_IDS,
          useValue: [match.id, this.matchId(), route.id],
        },
        // Add context providers based on match status
        ...(match.status === 'error'
          ? [
              {
                provide: ERROR_COMPONENT_CONTEXT,
                useValue: {
                  error: match.error,
                  info: { componentStack: '' },
                  reset: () => this.router.invalidate(),
                },
              },
            ]
          : []),
        ...(match.status === 'notFound'
          ? [
              {
                provide: NOT_FOUND_COMPONENT_CONTEXT,
                useValue: {},
              },
            ]
          : []),
      ],
      parent: routeInjector,
    })
  })

  // Environment injector for route providers
  environmentInjector = computed(() => {
    const route = this.route()
    if (!route) return null

    return this.router.getRouteEnvInjector(
      route.id,
      this.parentEnvInjector,
      route.options.providers || [],
      this.router,
    )
  })
}
```

### Benefits of This Approach

1. **Separation of Concerns**:
   - `DynamicComponent`: Handles rendering logic (ViewContainerRef, lifecycle)
   - `RouteMatch`: Handles state computation (signals, router state)

2. **Signal-based**: Uses Angular signals directly, no Observable intermediate step

3. **Simpler Logic**: Each computed signal has a single responsibility

4. **Reusable**: `DynamicComponent` can be used anywhere dynamic rendering is needed

5. **Type-safe**: Signal inputs provide type safety

6. **Automatic Cleanup**: `effect()` handles subscription cleanup automatically

### Comparison: Before vs After

**Before (Observable-based):**

- Complex Observable chains (`run$`, `match$`, `route$`, etc.)
- Manual subscription management
- Mixed concerns (state + rendering)
- ~350 lines of code

**After (Signal-based with wrapper):**

- Simple computed signals
- Automatic cleanup via `effect()`
- Separated concerns
- ~150 lines for RouteMatch + ~50 lines for DynamicComponent

### Potential Challenges

1. **Effect Timing**: `effect()` runs after component initialization, may need `afterNextRender()` for initial render

2. **Change Detection**: Still need `markForCheck()` but it's centralized in `DynamicComponent`

3. **Performance**: Multiple computed signals vs single Observable chain - need to benchmark

4. **Migration**: Existing Observable-based code would need refactoring

### Alternative: Direct Store → Signal

Even simpler approach - subscribe directly to router store:

```typescript
export class RouteMatch {
  matchId = input.required<string>()
  private router = injectRouter()

  // Direct signal from router store
  private routerState = computed(() => this.router.state)

  component = computed(() => {
    const state = this.routerState()
    const match = state.matches.find((m) => m.id === this.matchId())
    // ... component selection logic
  })

  injector = computed(() => {
    const state = this.routerState()
    const match = state.matches.find((m) => m.id === this.matchId())
    // ... injector creation logic
  })
}
```

This eliminates the Observable layer entirely, making it very similar to Solid's approach!

---

## Template Syntax Limitations

### React: JSX is Flexible

```tsx
// React - Can render anything dynamically
function RouteComponent() {
  const Component = getComponent()
  const props = getProps()

  return (
    <ErrorBoundary>
      <Suspense fallback={<Loading />}>
        <Component {...props} />
        <Outlet />
      </Suspense>
    </ErrorBoundary>
  )
}
```

### Angular: Template Constraints

```html
<!-- Angular - Limited template syntax -->
<ng-container *ngIf="component$ | async as Component">
  <!-- Can't dynamically render Component directly! -->
  <!-- Must use ViewContainerRef in TypeScript -->
</ng-container>
```

**Challenges:**

1. **No Dynamic Components in Templates**: Can't do `<[Component] />` in templates
   - Must use `ViewContainerRef` in TypeScript
   - Components rendered programmatically, not declaratively

2. **Structural Directives**: Limited to `*ngIf`, `*ngFor`, `*ngSwitch`
   - Can't create custom structural directives easily
   - Must use `ng-template` with `ViewContainerRef`

3. **Type Safety**: Templates are not type-checked by default
   - Must use `ng-template` with type guards
   ```typescript
   static ngTemplateContextGuard(
     _: MatchRoute,
     ctx: unknown
   ): ctx is { match: boolean } {
     return true
   }
   ```

**With Signal Inputs Approach:**

```html
<!-- Now we can use signals in template! -->
<dynamic-component [component]="component()" [injector]="injector()" />
```

This makes the template more declarative while still handling dynamic rendering in the wrapper component.

### Vue: Template + Render Functions

```vue
<!-- Vue - Can use both templates and render functions -->
<template>
  <component :is="Component" v-if="Component" />
  <Outlet v-else />
</template>

<script setup>
const Component = computed(() => route.value?.options.component)
</script>
```

**Challenges:**

1. **Dynamic Components**: Must use `<component :is="">` syntax

   ```vue
   <component :is="Component" />
   ```

   - Less intuitive than JSX
   - Requires component registration

2. **Fragment Handling**: Vue 3 automatically wraps multiple root nodes
   - Can cause hydration mismatches in SSR
   - Must be careful with single-element returns

3. **Slot Context**: Passing context through slots is verbose
   ```vue
   <template #default="{ match }">
     <Component :match="match" />
   </template>
   ```

---

## Dynamic Component Loading

### React: Lazy Loading is Simple

```tsx
// React - Built-in lazy loading
const LazyComponent = React.lazy(() => import('./Component'))

function RouteComponent() {
  return (
    <Suspense fallback={<Loading />}>
      <LazyComponent />
    </Suspense>
  )
}
```

### Angular: Requires Module/Standalone Setup

```typescript
// Angular - Must use dynamic imports with injector
async function loadRouteChunk(route: AnyRoute) {
  if (route.lazyFn) {
    const module = await route.lazyFn()
    // Module must export component
    const Component = module.default || module.Component

    // Must be standalone or registered in module
    return Component
  }
}

// In RouteMatch component
const Component = await loadRouteChunk(route)
this.cmpRef = this.vcr.createComponent(Component, {
  injector: this.createInjector(),
})
```

**Challenges:**

1. **Standalone Components**: Components must be standalone (Angular 14+)
   - Or must be registered in NgModule
   - Can't mix standalone and module-based

2. **Injector Context**: Dynamic components need injector
   - Must create injector with route context
   - Parent injector must be provided

3. **AOT Compilation**: Ahead-of-time compilation can break dynamic imports
   - Must use `@Component({ standalone: true })`
   - Or use `NgModule` with lazy loading

**With Signal Inputs:**

The `DynamicComponent` wrapper can handle lazy loading:

```typescript
export class DynamicComponent {
  component = input<Type<any> | (() => Promise<Type<any>>) | null>(null)

  private loadComponent = computedAsync(() => {
    const comp = this.component()
    if (!comp) return null
    if (typeof comp === 'function') {
      // Handle lazy loading
      return comp().then((m) => m.default || m.Component)
    }
    return Promise.resolve(comp)
  })

  // Use loadComponent in effect instead of component
}
```

### Vue: Async Components

```typescript
// Vue - Async component loading
const AsyncComponent = Vue.defineAsyncComponent(() => import('./Component.vue'))

// In route
const Component = route.options.component || AsyncComponent
return () => Vue.h(Component)
```

**Challenges:**

1. **Component Registration**: Async components must be registered
   - Or imported directly
   - Can't use string-based component names easily

2. **Suspense**: Vue 3 has Suspense, but it's less mature than React
   - Must handle loading/error states manually
   - SSR support is limited

---

## Error Boundaries

### React: Error Boundaries

```tsx
// React - Error boundaries are components
class ErrorBoundary extends React.Component {
  componentDidCatch(error, errorInfo) {
    // Handle error
  }

  render() {
    if (this.state.hasError) {
      return <ErrorComponent error={this.state.error} />
    }
    return this.props.children
  }
}
```

### Angular: Error Handling

```typescript
// Angular - Must catch errors in subscription
export class RouteMatch {
  constructor() {
    this.run$.subscribe({
      next: (data) => {
        // Render component
      },
      error: (error) => {
        // Create error component with injector
        const injector = Injector.create({
          providers: [
            {
              provide: ERROR_COMPONENT_CONTEXT,
              useValue: { error, reset: () => router.invalidate() },
            },
          ],
          parent: this.injector,
        })
        this.vcr.clear()
        this.vcr.createComponent(ErrorComponent, { injector })
      },
    })
  }
}
```

**Challenges:**

1. **No Error Boundaries**: Angular doesn't have error boundaries
   - Must catch errors in every subscription
   - Must manually create error component with context

2. **Error Context**: Must pass error context through injector
   - Can't use component props
   - Must use InjectionToken

3. **Error Recovery**: Must manually handle error recovery
   - No automatic retry mechanism
   - Must call `router.invalidate()` manually

**With Signal Inputs:**

Errors can be handled in the computed signal:

```typescript
component = computed(() => {
  const match = this.match()
  if (match?.status === 'error') {
    return ErrorComponent // Automatically handled
  }
  // ...
})
```

### Vue: Error Handling

```typescript
// Vue - Error handling in setup
export const MatchInner = Vue.defineComponent({
  setup(props) {
    const matchState = useRouterState({...})

    // Catch errors in computed
    const error = Vue.computed(() => {
      try {
        return matchState.value?.error
      } catch (e) {
        return e
      }
    })

    return () => {
      if (error.value) {
        return Vue.h(ErrorComponent, { error: error.value })
      }
      // Render component
    }
  },
})
```

**Challenges:**

1. **No Error Boundaries**: Vue doesn't have error boundaries
   - Must catch errors manually
   - Must handle in computed/watch

2. **Error Propagation**: Errors don't bubble up automatically
   - Must manually check for errors in each component
   - Must pass error through props/context

---

## SSR Considerations

### React: Server Components + Streaming

```tsx
// React - SSR is straightforward
export async function renderToString(router) {
  await router.load()
  return ReactDOMServer.renderToString(
    <RouterProvider router={router}>
      <App />
    </RouterProvider>,
  )
}
```

### Angular: Universal/SSR

```typescript
// Angular - Requires platform-server
import { platformServer } from '@angular/platform-server'

export async function renderToString(router) {
  await router.load()

  const platform = platformServer([{ provide: ROUTER, useValue: router }])

  const moduleRef = await platform.bootstrapModule(AppModule)
  const appRef = moduleRef.injector.get(ApplicationRef)

  return appRef.components[0].location.nativeElement.innerHTML
}
```

**Challenges:**

1. **Platform Server**: Must use `@angular/platform-server`
   - Different rendering path than client
   - Must handle platform-specific code

2. **Module Bootstrap**: Must bootstrap full Angular application
   - Can't just render components
   - Requires NgModule or standalone bootstrap

3. **Hydration**: Must handle hydration mismatches
   - Angular's hydration is less mature than React
   - Must be careful with DOM manipulation

### Vue: SSR

```typescript
// Vue - SSR with renderToString
import { renderToString } from '@vue/server-renderer'

export async function renderToString(router) {
  await router.load()

  const app = Vue.createApp({
    setup() {
      return () => Vue.h(RouterProvider, { router })
    },
  })

  return renderToString(app)
}
```

**Challenges:**

1. **Fragment Handling**: Vue 3's implicit fragments cause hydration issues
   - Must return single root element
   - Must be careful with array returns

2. **Reactive State**: Server state must be serialized
   - Must use `serializeState` or similar
   - Client must hydrate state

---

## Summary of Key Challenges

### Angular

1. **No JSX**: Must use `ViewContainerRef` for dynamic components
2. **Dependency Injection**: Complex injector hierarchy for route context
3. **Observables**: Must convert Store to Observable (or Signal directly)
4. **Change Detection**: Must use `OnPush` and manual `markForCheck()`
5. **Templates**: Limited template syntax, must render programmatically
6. **Error Handling**: No error boundaries, must catch in subscriptions
7. **SSR**: Requires platform-server and full app bootstrap

**Potential Simplification with Signal Inputs:**

- ✅ Separate rendering logic into `DynamicComponent` wrapper
- ✅ Use signals directly (no Observable intermediate)
- ✅ Simplify `RouteMatch` to just compute signals
- ✅ Automatic cleanup via `effect()`
- ✅ More declarative template usage

### Vue

1. **Render Functions**: Must use `Vue.h()` instead of JSX
2. **Reactivity**: Router state not Vue-reactive by default
3. **Component Registration**: Components must be registered/imported
4. **Fragment Handling**: Implicit fragments cause hydration issues
5. **Stale Props**: Complex logic to handle same-route transitions
6. **Error Handling**: No error boundaries, must catch manually
7. **SSR**: Fragment handling and state serialization challenges

### Solutions Implemented

All adapters solve these challenges by:

1. **Wrapper Components**: Creating framework-specific wrapper components
   - `RouteMatch` (Angular) / `Match` (Vue) that handle dynamic rendering
   - `Outlet` component that manages child route rendering

2. **State Adapters**: Converting router state to framework-native format
   - **Solid**: Store → Accessor (direct, native signals, no conversion)
   - **Angular (current)**: Store → Observable → Signal (Observable step for compatibility)
   - **Angular (potential)**: Store → Signal (direct, via effect/computed, similar to Solid)
   - **Vue**: Store → Computed/Ref (via useStore wrapper)
   - **React**: Store → useState + subscription (hooks-based)

3. **Context Injection**: Framework-specific context propagation
   - Angular: Custom injectors with InjectionTokens
   - Vue: Provide/Inject with Symbols

4. **Error Handling**: Framework-specific error handling
   - Angular: Error component with injector context
   - Vue: Error component with props

5. **SSR Support**: Framework-specific SSR implementations
   - Angular: Platform-server with module bootstrap
   - Vue: `@vue/server-renderer` with careful fragment handling

---

## Conclusion

Implementing router adapters for different frameworks requires significant framework-specific code to bridge the gap between TanStack Router's reactive state management and each framework's rendering model.

### Framework Comparison

| Framework   | Rendering     | Reactivity             | Context        | Complexity  |
| ----------- | ------------- | ---------------------- | -------------- | ----------- |
| **React**   | JSX           | Hooks + re-renders     | Context API    | ⭐ Low      |
| **Solid**   | JSX           | Native Signals         | Context API    | ⭐ Low      |
| **Vue**     | Templates/JSX | Computed (signal-like) | Provide/Inject | ⭐⭐ Medium |
| **Angular** | Templates     | Observables/Signals    | DI             | ⭐⭐⭐ High |

### Key Challenges by Framework

**React/Solid (Low Complexity):**

- ✅ JSX makes dynamic rendering straightforward
- ✅ Context API is simple and direct
- ✅ React: Hooks trigger re-renders automatically
- ✅ Solid: Native signals provide finest-grained updates

**Vue (Medium Complexity):**

1. **Template-based rendering** (though JSX is possible)
2. **Reactivity wrapping** (Store → Computed via useStore)
3. **Provide/Inject** (similar to Context but more verbose)
4. **Fragment handling** in SSR

**Angular (High Complexity):**

1. **Template-based rendering** (no JSX, must use ViewContainerRef)
2. **Dual reactivity model** (Observables + Signals)
3. **Complex DI system** (hierarchical injectors)
4. **Limited dynamic component support** in templates
5. **Manual change detection** management

**Potential Simplification for Angular:**

The signal inputs approach (`DynamicComponent` wrapper) could significantly reduce complexity:

- ✅ Separates rendering from state management
- ✅ Uses signals directly (no Observable layer)
- ✅ More declarative template usage
- ✅ Automatic cleanup via `effect()`
- ✅ Reusable component for dynamic rendering

This would bring Angular's complexity closer to Vue's level, making it more maintainable and easier to understand.

### Framework-Specific Route Options

Each adapter can extend route options through TypeScript module augmentation. Here's what each adapter adds:

#### Angular: `providers` Option

**Angular is unique** - it's the only adapter that adds a non-component-related route option:

```typescript
declare module '@tanstack/router-core' {
  export interface UpdatableRouteOptionsExtensions {
    component?: () => RouteComponent
    errorComponent?: false | null | (() => RouteComponent)
    notFoundComponent?: () => RouteComponent
    pendingComponent?: () => RouteComponent
    providers?: Provider[] // ← Angular-specific!
  }
}
```

**Usage:**

```typescript
export const postsRoute = new Route({
  path: '/posts',
  component: PostsComponent,
  providers: [
    { provide: PostsService, useClass: PostsService },
    { provide: ANALYTICS_TOKEN, useValue: analyticsConfig },
  ],
})
```

**Why Angular needs this:**

- Angular's DI system requires providers to be registered
- Route-level providers enable route-scoped services
- Environment injector makes these providers available to all components in the route tree

#### React/Solid/Vue: Component Types Only

These adapters only extend component types for framework-specific component definitions:

**React:**

```typescript
export interface UpdatableRouteOptionsExtensions {
  component?: RouteComponent // React component type
  errorComponent?: ErrorRouteComponent
  notFoundComponent?: NotFoundRouteComponent
  pendingComponent?: RouteComponent
}
```

**Solid:**

```typescript
export interface UpdatableRouteOptionsExtensions {
  component?: RouteComponent // Solid component type
  errorComponent?: ErrorRouteComponent
  notFoundComponent?: NotFoundRouteComponent
  pendingComponent?: RouteComponent
}
```

**Vue:**

```typescript
export interface UpdatableRouteOptionsExtensions {
  component?: RouteComponent | VueSFC // Vue component or SFC
  errorComponent?: ErrorRouteComponent | VueSFC
  notFoundComponent?: NotFoundRouteComponent | VueSFC
  pendingComponent?: RouteComponent | VueSFC
}
```

**What they add:**

- Framework-specific component types (for type safety)
- `shellComponent` for root route (React/Solid only, for SSR)
- **No additional route-level configuration options**

### Comparison: Route Options Extensions

| Framework   | Additional Route Options    | Purpose                              |
| ----------- | --------------------------- | ------------------------------------ |
| **Angular** | `providers?: Provider[]`    | Route-level dependency injection     |
| **React**   | None (only component types) | Type safety for React components     |
| **Solid**   | None (only component types) | Type safety for Solid components     |
| **Vue**     | None (only component types) | Type safety for Vue components + SFC |

### Why Only Angular?

Angular is the only framework that requires explicit provider registration for dependency injection. Other frameworks handle this differently:

- **React**: Uses Context API - providers are React components, not route options
- **Solid**: Uses Context API - providers are Solid components, not route options
- **Vue**: Uses Provide/Inject - providers are Vue components or setup functions, not route options

Angular's DI system is more explicit and requires providers to be registered in injectors, which is why the `providers` option exists specifically for Angular.

### Signals: The Common Ground

Interestingly, **Solid, Angular, and Vue all support signal-like patterns**, which provides a common abstraction:

- **Solid**: Native `Accessor` signals (most performant)
- **Angular**: `Signal<T>` (Angular 16+, via `toSignal()` or direct `computed()`)
- **Vue**: `Ref<T>` / `ComputedRef<T>` (via `useStore`)

This signal-based approach offers:

- Fine-grained updates
- Automatic dependency tracking
- Better performance than full component re-renders
- Type-safe state access

### Solutions Implemented

All adapters solve these challenges by:

1. **Wrapper Components**: Framework-specific components (`RouteMatch`, `Match`, `Outlet`)
2. **State Adapters**: Converting Store to framework-native reactivity
3. **Context Injection**: Framework-specific context propagation
4. **Error Handling**: Framework-specific error boundaries/handling
5. **SSR Support**: Framework-specific SSR implementations

With careful design and framework-specific abstractions, these challenges can be overcome to provide a seamless routing experience across all frameworks, with Solid and React having the simplest implementations due to their JSX-based rendering and signal/hook reactivity models.
