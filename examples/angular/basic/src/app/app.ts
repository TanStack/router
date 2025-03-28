import { Component } from '@angular/core';
import { Link, Outlet, RouterDevtools } from '@tanstack/angular-router';

@Component({
  selector: 'app-root',
  imports: [Outlet, Link, RouterDevtools],
  template: `
    <div className="p-2 flex gap-2 text-lg border-b">
      <a [link]="{ to: '/' }" [linkActive]="{ exact: false }">
        Home
      </a>
      <a link="/posts" linkActive='font-bold'>
        Posts
      </a>
      <a link to="/route-a" linkActive='font-bold'>
        Pathless Layout
      </a>
      <a link="/this-route-does-not-exist" linkActive="font-bold">>
        This Route Does Not Exist
      </a>
    </div>
    <outlet />
    <router-devtools position="bottom-right" />
  `
})
export class AppComponent {}
