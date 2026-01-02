import { Component } from '@angular/core';
import { createRoute } from '@tanstack/angular-router';
import { Route as RootRoute } from './root.route';

@Component({
  selector: 'app-home',
  template: `
    <div class="home">
      <h2>Welcome Home!</h2>
      <p>This is the home page of our simple Angular router example.</p>
      <p>Navigate to the About page using the link in the navigation above.</p>
    </div>
  `,
  styles: [
    `
      .home {
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
class HomeComponent {}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/',
  component: HomeComponent,
});
