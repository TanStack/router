import { Component } from '@angular/core';
import {
  createRootRoute,
  Outlet,
  injectNavigate,
  injectRouterState,
} from '@tanstack/angular-router';
import { TanStackRouterDevtools } from '@tanstack/angular-router-devtools';

@Component({
  selector: 'app-root-layout',
  imports: [Outlet, TanStackRouterDevtools],
  template: `
    <div class="app-container">
      <nav>
        <h1>Angular Router Example</h1>
        <ul>
          <li>
            <a href="/" (click)="navigateHome($event)" [class.active]="isActive('/')">Home</a>
          </li>
          <li>
            <a href="/about" (click)="navigateAbout($event)" [class.active]="isActive('/about')"
              >About</a
            >
          </li>
          <li>
            <a href="/posts" (click)="navigatePosts($event)" [class.active]="isActive('/posts')"
              >Posts</a
            >
          </li>
        </ul>
      </nav>
      <main>
        <outlet />
      </main>
      <router-devtools position="bottom-right" />
    </div>
  `,
  styles: [
    `
      .app-container {
        max-width: 800px;
        margin: 0 auto;
        padding: 2rem;
      }
      nav {
        border-bottom: 2px solid #eee;
        padding-bottom: 1rem;
        margin-bottom: 2rem;
      }
      nav h1 {
        margin: 0 0 1rem 0;
      }
      nav ul {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        gap: 1rem;
      }
      nav a {
        text-decoration: none;
        color: #007bff;
        padding: 0.5rem 1rem;
        border-radius: 4px;
      }
      nav a:hover {
        background-color: #f0f0f0;
      }
      nav a.active {
        font-weight: bold;
        background-color: #e3f2fd;
      }
      main {
        min-height: 400px;
      }
    `,
  ],
})
class RootLayout {
  navigate = injectNavigate();
  routerState = injectRouterState();

  navigateHome(event: Event) {
    event.preventDefault();
    this.navigate({ to: '/' });
  }

  navigateAbout(event: Event) {
    event.preventDefault();
    this.navigate({ to: '/about' });
  }

  navigatePosts(event: Event) {
    event.preventDefault();
    this.navigate({ to: '/posts' });
  }

  isActive(path: string): boolean {
    const currentPath = this.routerState().location.pathname;
    return currentPath === path || currentPath.startsWith(path + '/');
  }
}

export const Route = createRootRoute({
  component: RootLayout,
});
