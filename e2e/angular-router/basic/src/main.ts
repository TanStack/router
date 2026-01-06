import { Component, computed, signal } from '@angular/core'
import { JsonPipe } from '@angular/common'
import { bootstrapApplication } from '@angular/platform-browser'
import {
  Outlet,
  Link,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  injectErrorState,
  injectRouter,
  injectRouterState,
  redirect,
} from '@tanstack/angular-router'
import { TanStackRouterDevtools } from '@tanstack/angular-router-devtools'
import { NotFoundError, fetchPost, fetchPosts } from './posts'
import './styles.css'

const rootRoute = createRootRoute({
  component: () => RootComponent,
  notFoundComponent: () => NotFoundComponent,
})

@Component({
  selector: 'app-root-layout',
  standalone: true,
  imports: [Outlet, Link, TanStackRouterDevtools],
  template: `
    <div id="app">
      <div class="p-2 flex gap-2 text-lg border-b">
        <a [link]="{ to: '/' }" [class]="isActive('/') ? 'font-bold' : ''">
          Home
        </a>
        <a
          [link]="{ to: '/posts' }"
          [class]="isActive('/posts') ? 'font-bold' : ''"
        >
          Posts
        </a>
        <a [link]="{ to: '/posts', viewTransition: true }"> View Transition </a>
        <a [link]="{ to: '/posts', viewTransition: { types: ['dummy'] } }">
          View Transition types
        </a>
        <a
          [link]="{ to: '/layout-a' }"
          [class]="isActive('/layout-a') ? 'font-bold' : ''"
        >
          Layout
        </a>
        <a
          [link]="{ to: '/this-route-does-not-exist' }"
          [class]="isActive('/this-route-does-not-exist') ? 'font-bold' : ''"
        >
          This Route Does Not Exist
        </a>
        <div class="flex items-center">
          <svg width="20" height="20" viewBox="0 0 20 20" role="img">
            <title id="rectTitle">Link in SVG</title>
            <a [link]="{ to: '/posts' }" aria-label="Open posts from SVG">
              <rect
                x="0"
                y="0"
                width="20"
                height="20"
                rx="4"
                fill="blue"
                strokeWidth="2"
              />
            </a>
          </svg>
        </div>
      </div>
      <outlet />
      <router-devtools position="bottom-right" />
    </div>
  `,
})
class RootComponent {
  routerState = injectRouterState()

  isActive(path: string): boolean {
    const currentPath = this.routerState().location.pathname
    if (path === '/') {
      return currentPath === path
    }
    return currentPath === path || currentPath.startsWith(path + '/')
  }
}

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [Link],
  template: `
    <div>
      <p>This is the notFoundComponent configured on root route</p>
      <a [link]="{ to: '/' }">Start Over</a>
    </div>
  `,
})
class NotFoundComponent {}

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => IndexComponent,
})

@Component({
  selector: 'app-index',
  standalone: true,
  template: `
    <div class="p-2">
      <h3>Welcome Home!</h3>
    </div>
  `,
})
class IndexComponent {}

export const postsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'posts',
  loader: () => fetchPosts(),
}).lazy(() => import('./posts.lazy').then((d) => d.Route))

const postsIndexRoute = createRoute({
  getParentRoute: () => postsRoute,
  path: '/',
  component: () => PostsIndexComponent,
})

@Component({
  selector: 'app-posts-index',
  standalone: true,
  template: `<div>Select a post.</div>`,
})
class PostsIndexComponent {}

const postRoute = createRoute({
  getParentRoute: () => postsRoute,
  path: '$postId',
  errorComponent: () => PostErrorComponent,
  loader: ({ params }) => fetchPost(params.postId),
  component: () => PostComponent,
})

@Component({
  selector: 'app-post-error',
  standalone: true,
  template: `
    @if (isNotFoundError()) {
      <div>{{ errorState.error.message }}</div>
    } @else {
      <app-error />
    }
  `,
})
class PostErrorComponent {
  errorState = injectErrorState()
  isNotFoundError = computed(
    () => this.errorState.error instanceof NotFoundError,
  )
}

@Component({
  selector: 'app-post',
  standalone: true,
  template: `
    <div class="space-y-2">
      <h4 class="text-xl font-bold">{{ post().title }}</h4>
      <hr class="opacity-20" />
      <div class="text-sm">{{ post().body }}</div>
    </div>
  `,
})
class PostComponent {
  post = postRoute.injectLoaderData()
}

const layoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_layout',
  component: () => LayoutComponent,
})

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [Outlet],
  template: `
    <div class="p-2">
      <div class="border-b">I'm a layout</div>
      <div>
        <outlet />
      </div>
    </div>
  `,
})
class LayoutComponent {}

const layout2Route = createRoute({
  getParentRoute: () => layoutRoute,
  id: '_layout-2',
  component: () => Layout2Component,
})

@Component({
  selector: 'app-layout-2',
  standalone: true,
  imports: [Outlet, Link],
  template: `
    <div>
      <div>I'm a nested layout</div>
      <div class="flex gap-2 border-b">
        <a
          [link]="{ to: '/layout-a' }"
          [class]="isActive('/layout-a') ? 'font-bold' : ''"
        >
          Layout A
        </a>
        <a
          [link]="{ to: '/layout-b' }"
          [class]="isActive('/layout-b') ? 'font-bold' : ''"
        >
          Layout B
        </a>
      </div>
      <div>
        <outlet />
      </div>
    </div>
  `,
})
class Layout2Component {
  routerState = injectRouterState()

  isActive(path: string): boolean {
    const currentPath = this.routerState().location.pathname
    return currentPath === path || currentPath.startsWith(path + '/')
  }
}

const layoutARoute = createRoute({
  getParentRoute: () => layout2Route,
  path: '/layout-a',
  component: () => LayoutAComponent,
})

@Component({
  selector: 'app-layout-a',
  standalone: true,
  template: `<div>I'm layout A!</div>`,
})
class LayoutAComponent {}

const layoutBRoute = createRoute({
  getParentRoute: () => layout2Route,
  path: '/layout-b',
  component: () => LayoutBComponent,
})

@Component({
  selector: 'app-layout-b',
  standalone: true,
  template: `<div>I'm layout B!</div>`,
})
class LayoutBComponent {}

const paramsPsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/params-ps',
})

const paramsPsIndexRoute = createRoute({
  getParentRoute: () => paramsPsRoute,
  path: '/',
  component: () => ParamsIndexComponent,
})

@Component({
  selector: 'app-params-index',
  standalone: true,
  imports: [Link],
  template: `
    <div>
      <h3 class="pb-2">Named path params</h3>
      <ul class="grid mb-2">
        <li>
          <a
            data-testid="l-to-named-foo"
            [link]="{
              to: '/params-ps/named/$foo',
              params: { foo: 'foo' },
            }"
          >
            /params-ps/named/$foo
          </a>
        </li>
        <li>
          <a
            data-testid="l-to-named-prefixfoo"
            [link]="{
              to: '/params-ps/named/prefix{$foo}',
              params: { foo: 'foo' },
            }"
          >
            /params-ps/named/prefix&#123;$foo&#125;
          </a>
        </li>
        <li>
          <a
            data-testid="l-to-named-foosuffix"
            [link]="{
              to: '/params-ps/named/{$foo}suffix',
              params: { foo: 'foo' },
            }"
          >
            /params-ps/named/&#123;$foo&#125;suffix
          </a>
        </li>
      </ul>
      <hr />
      <h3 class="pb-2">Wildcard path params</h3>
      <ul class="grid mb-2">
        <li>
          <a
            data-testid="l-to-wildcard-foo"
            [link]="{
              to: '/params-ps/wildcard/$',
              params: { _splat: 'foo' },
            }"
          >
            /params-ps/wildcard/$
          </a>
        </li>
        <li>
          <a
            data-testid="l-to-wildcard-prefixfoo"
            [link]="{
              to: '/params-ps/wildcard/prefix{$}',
              params: { _splat: 'foo' },
            }"
          >
            /params-ps/wildcard/prefix&#123;$&#125;
          </a>
        </li>
        <li>
          <a
            data-testid="l-to-wildcard-foosuffix"
            [link]="{
              to: '/params-ps/wildcard/{$}suffix',
              params: { _splat: 'foo' },
            }"
          >
            /params-ps/wildcard/&#123;$&#125;suffix
          </a>
        </li>
      </ul>
    </div>
  `,
})
class ParamsIndexComponent {}

const paramsPsNamedRoute = createRoute({
  getParentRoute: () => paramsPsRoute,
  path: '/named',
})

const paramsPsNamedIndexRoute = createRoute({
  getParentRoute: () => paramsPsNamedRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/params-ps' })
  },
})

const paramsPsNamedFooRoute = createRoute({
  getParentRoute: () => paramsPsNamedRoute,
  path: '/$foo',
  component: () => ParamsNamedFooComponent,
})

@Component({
  selector: 'app-params-named-foo',
  standalone: true,
  template: `
    <div>
      <h3>ParamsNamedFoo</h3>
      <div data-testid="params-output">{{ paramsJson() }}</div>
    </div>
  `,
})
class ParamsNamedFooComponent {
  params = paramsPsNamedFooRoute.injectParams()
  paramsJson = computed(() => JSON.stringify(this.params()))
}

const paramsPsNamedFooPrefixRoute = createRoute({
  getParentRoute: () => paramsPsNamedRoute,
  path: '/prefix{$foo}',
  component: () => ParamsNamedFooPrefixComponent,
})

@Component({
  selector: 'app-params-named-foo-prefix',
  standalone: true,
  template: `
    <div>
      <h3>ParamsNamedFooPrefix</h3>
      <div data-testid="params-output">{{ paramsJson() }}</div>
    </div>
  `,
})
class ParamsNamedFooPrefixComponent {
  params = paramsPsNamedFooPrefixRoute.injectParams()
  paramsJson = computed(() => JSON.stringify(this.params()))
}

const paramsPsNamedFooSuffixRoute = createRoute({
  getParentRoute: () => paramsPsNamedRoute,
  path: '/{$foo}suffix',
  component: () => ParamsNamedFooSuffixComponent,
})

@Component({
  selector: 'app-params-named-foo-suffix',
  standalone: true,
  template: `
    <div>
      <h3>ParamsNamedFooSuffix</h3>
      <div data-testid="params-output">{{ paramsJson() }}</div>
    </div>
  `,
})
class ParamsNamedFooSuffixComponent {
  params = paramsPsNamedFooSuffixRoute.injectParams()
  paramsJson = computed(() => JSON.stringify(this.params()))
}

const paramsPsWildcardRoute = createRoute({
  getParentRoute: () => paramsPsRoute,
  path: '/wildcard',
})

const paramsPsWildcardIndexRoute = createRoute({
  getParentRoute: () => paramsPsWildcardRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/params-ps' })
  },
})

const paramsPsWildcardSplatRoute = createRoute({
  getParentRoute: () => paramsPsWildcardRoute,
  path: '$',
  component: () => ParamsWildcardSplatComponent,
})

@Component({
  selector: 'app-params-wildcard-splat',
  standalone: true,
  template: `
    <div>
      <h3>ParamsWildcardSplat</h3>
      <div data-testid="params-output">{{ paramsJson() }}</div>
    </div>
  `,
})
class ParamsWildcardSplatComponent {
  params = paramsPsWildcardSplatRoute.injectParams()
  paramsJson = computed(() => JSON.stringify(this.params()))
}

const paramsPsWildcardSplatPrefixRoute = createRoute({
  getParentRoute: () => paramsPsWildcardRoute,
  path: 'prefix{$}',
  component: () => ParamsWildcardSplatPrefixComponent,
})

@Component({
  selector: 'app-params-wildcard-splat-prefix',
  standalone: true,
  template: `
    <div>
      <h3>ParamsWildcardSplatPrefix</h3>
      <div data-testid="params-output">{{ paramsJson() }}</div>
    </div>
  `,
})
class ParamsWildcardSplatPrefixComponent {
  params = paramsPsWildcardSplatPrefixRoute.injectParams()
  paramsJson = computed(() => JSON.stringify(this.params()))
}

const paramsPsWildcardSplatSuffixRoute = createRoute({
  getParentRoute: () => paramsPsWildcardRoute,
  path: '{$}suffix',
  component: () => ParamsWildcardSplatSuffixComponent,
})

@Component({
  selector: 'app-params-wildcard-splat-suffix',
  standalone: true,
  template: `
    <div>
      <h3>ParamsWildcardSplatSuffix</h3>
      <div data-testid="params-output">{{ paramsJson() }}</div>
    </div>
  `,
})
class ParamsWildcardSplatSuffixComponent {
  params = paramsPsWildcardSplatSuffixRoute.injectParams()
  paramsJson = computed(() => JSON.stringify(this.params()))
}

@Component({
  selector: 'app-error',
  standalone: true,
  imports: [JsonPipe],
  template: `
    <div class="p-2">
      <h2>Error</h2>
      <pre>{{ errorState.error | json }}</pre>
      <button (click)="reset()">Reset</button>
    </div>
  `,
})
class ErrorComponent {
  errorState = injectErrorState()
  router = injectRouter()

  reset() {
    this.router.invalidate()
  }
}

const routeTree = rootRoute.addChildren([
  postsRoute.addChildren([postRoute, postsIndexRoute]),
  layoutRoute.addChildren([
    layout2Route.addChildren([layoutARoute, layoutBRoute]),
  ]),
  paramsPsRoute.addChildren([
    paramsPsNamedRoute.addChildren([
      paramsPsNamedFooPrefixRoute,
      paramsPsNamedFooSuffixRoute,
      paramsPsNamedFooRoute,
      paramsPsNamedIndexRoute,
    ]),
    paramsPsWildcardRoute.addChildren([
      paramsPsWildcardSplatRoute,
      paramsPsWildcardSplatPrefixRoute,
      paramsPsWildcardSplatSuffixRoute,
      paramsPsWildcardIndexRoute,
    ]),
    paramsPsIndexRoute,
  ]),
  indexRoute,
])

// Set up a Router instance
const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultStaleTime: 5000,
  scrollRestoration: true,
  defaultErrorComponent: () => ErrorComponent,
})

// Register things for typesafety
declare module '@tanstack/angular-router' {
  interface Register {
    router: typeof router
  }
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterProvider],
  template: `<router-provider [router]="router" />`,
})
class AppComponent {
  router = router
}

bootstrapApplication(AppComponent).catch((err) => console.error(err))
