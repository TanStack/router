import {
  DefaultNotFound,
  Link,
  Outlet,
  RouterDevtools,
  createRootRoute,
} from '@tanstack/angular-router'
import { ChangeDetectionStrategy, Component } from '@angular/core'

export const rootRoute = createRootRoute({
  notFoundComponent: () => DefaultNotFound,
})

@Component({
  selector: 'Root',
  template: `
    <div class="p-2 flex gap-2 text-lg border-b">
      <a link="/" [linkActive]="{ exact: false }"> Home </a>
      <a link="/posts" linkActive="font-bold"> Posts </a>
      <a link="/route-a" linkActive="font-bold"> Pathless Layout </a>
      <a [link]="doesNotExist" linkActive="font-bold">
        This Route Does Not Exist
      </a>
    </div>
    <outlet />
    <router-devtools position="bottom-right" />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Link, Outlet, RouterDevtools],
})
export class Root {
  protected doesNotExist: any = '/this-route-does-not-exist'
}
