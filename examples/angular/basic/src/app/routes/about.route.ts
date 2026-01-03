import { Component } from '@angular/core';
import { createRoute, RouterLink } from '@tanstack/angular-router';
import { Route as RootRoute } from './root.route';
import { Outlet, injectNavigate, injectRouterState } from '@tanstack/angular-router';

@Component({
  selector: 'app-about',
  imports: [Outlet, RouterLink],
  template: `
    <div class="about">
      <h2>About</h2>
      <p>This is the about page.</p>
      <p>This example demonstrates how to use TanStack Router with Angular.</p>

      <nav class="about-nav">
        <a
          [routerLink]="{ to: '/about' }"
          [class.active]="isActive('/about') && !isActive('/about/angular')"
          >About</a
        >
        <a [routerLink]="{ to: '/about/angular' }" [class.active]="isActive('/about/angular')"
          >About Angular</a
        >
      </nav>

      <outlet />
    </div>
  `,
  styles: [
    `
      .about {
        padding: 2rem;
      }
      h2 {
        color: #333;
        margin-bottom: 1rem;
      }
      p {
        color: #666;
        line-height: 1.6;
        margin-bottom: 1rem;
      }
      .about-nav {
        display: flex;
        gap: 1rem;
        margin: 2rem 0;
        padding-bottom: 1rem;
        border-bottom: 1px solid #eee;
      }
      .about-nav a {
        color: #007bff;
        text-decoration: none;
        padding: 0.5rem 1rem;
        border-radius: 4px;
        transition: background-color 0.2s;
      }
      .about-nav a:hover {
        background-color: #f0f0f0;
      }
      .about-nav a.active {
        background-color: #007bff;
        color: white;
      }
    `,
  ],
})
class AboutComponent {
  navigate = injectNavigate({ from: '/about' });
  routerState = injectRouterState();

  isActive(path: string): boolean {
    return this.routerState().location.pathname === path;
  }
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/about',
  component: AboutComponent,
});
