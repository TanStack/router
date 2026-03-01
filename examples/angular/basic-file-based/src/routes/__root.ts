import { Component } from '@angular/core'
import {
  Link,
  Outlet,
  createRootRoute,
} from '@tanstack/angular-router-experimental'
import { TanStackRouterDevtools } from '@tanstack/angular-router-devtools'

export const Route = createRootRoute({
  component: () => RootComponent,
  notFoundComponent: () => NotFoundComponent,
})

@Component({
  selector: 'root-route',
  standalone: true,
  template: `
    <div class="p-2 flex gap-2 text-lg border-b">
      <a
        [link]="{ to: '/', activeProps: { class: 'font-bold' }, activeOptions: { exact: true } }"
      >
        Home
      </a>
      <a [link]="{ to: '/posts', activeProps: { class: 'font-bold' } }">
        Posts
      </a>
      <a
        [link]="{ to: '/route-a', activeProps: { class: 'font-bold' } }"
      >
        Pathless Layout
      </a>
      <a [link]="{ to: '/anchor', activeProps: { class: 'font-bold' } }">
        Anchor
      </a>
      <a [link]="{ to: '/this-route-does-not-exist', activeProps: { class: 'font-bold' } }">
        This Route Does Not Exist
      </a>
    </div>
    <hr />
    <outlet />
    <router-devtools />
  `,
  imports: [Outlet, Link, TanStackRouterDevtools],
})
class RootComponent {}

@Component({
  selector: 'not-found',
  standalone: true,
  template: `
    <div>
      <p>This is the notFoundComponent configured on root route</p>
      <a [link]="{ to: '/' }">Start Over</a>
    </div>
  `,
  imports: [Link],
})
class NotFoundComponent {}
