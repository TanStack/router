import { Component } from '@angular/core';
import { createRoute } from '@tanstack/angular-router';
import { Route as RootRoute } from './root.route';

@Component({
  selector: 'app-about',
  template: `
    <div class="about">
      <h2>About</h2>
      <p>This is the about page.</p>
      <p>This example demonstrates how to use TanStack Router with Angular.</p>
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
      }
    `,
  ],
})
class AboutComponent {}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/about',
  component: AboutComponent,
});
