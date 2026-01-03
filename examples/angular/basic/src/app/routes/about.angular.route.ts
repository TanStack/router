import { Component } from '@angular/core';
import { createRoute } from '@tanstack/angular-router';
import { Route as AboutRoute } from './about.route';

@Component({
  selector: 'app-about-angular',
  template: `
    <div class="about-angular">
      <h2>About Angular</h2>
      <p>This is a nested route under the About page.</p>
      <p>
        TanStack Router provides excellent type safety and developer experience for Angular
        applications.
      </p>
      <div class="features">
        <h3>Key Features:</h3>
        <ul>
          <li>Type-safe routing with full TypeScript support</li>
          <li>Built-in data loading with loaders</li>
          <li>Search parameter validation</li>
          <li>Nested routing support</li>
          <li>Programmatic navigation</li>
        </ul>
      </div>
    </div>
  `,
  styles: [
    `
      .about-angular {
        padding: 2rem;
        max-width: 800px;
        margin: 0 auto;
      }
      h2 {
        color: #333;
        margin-bottom: 1rem;
      }
      h3 {
        color: #333;
        margin-top: 2rem;
        margin-bottom: 1rem;
      }
      p {
        color: #666;
        line-height: 1.6;
        margin-bottom: 1rem;
      }
      .features {
        background-color: #f5f5f5;
        padding: 1.5rem;
        border-radius: 8px;
        margin-top: 1.5rem;
      }
      ul {
        margin: 0;
        padding-left: 1.5rem;
        color: #666;
      }
      li {
        margin-bottom: 0.5rem;
        line-height: 1.6;
      }
    `,
  ],
})
class AboutAngularComponent {}

export const Route = createRoute({
  getParentRoute: () => AboutRoute,
  path: 'angular',
  component: AboutAngularComponent,
});
